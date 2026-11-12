/**
 * Reglas puras de la cola offline: orden por envío y clasificación de fallas.
 *
 * Sin imports a propósito (ni React Native ni axios): así se prueban con
 * `node --test` sin un runtime de RN. Ver `mobile/tests/sync-drain.test.mjs`.
 *
 * ## Por qué existe
 *
 * Una entrega confirmada podía quedar "en camino" para siempre por dos
 * caminos, los dos dentro de la cola:
 *
 * 1. **Desorden.** El drenado salteaba un evento en espera de reintento
 *    (backoff) y seguía con los siguientes. Si `SHIPMENT_IN_TRANSIT` estaba en
 *    backoff, `SHIPMENT_DELIVERED` del mismo envío llegaba primero al servidor;
 *    el grafo de estados rechaza `assigned → delivered`, la respuesta era 200,
 *    el evento salía de la cola, y después `IN_TRANSIT` dejaba el envío en
 *    `out_for_delivery`. La entrega se había perdido sin aviso.
 * 2. **Abandono.** Tras 5 fallas el evento quedaba en la cola sin enviarse
 *    nunca más. Con backoff de 1, 2, 4, 8 y 16 s, bastaban ~31 s de señal mala
 *    con la app abierta para descartar una entrega para siempre.
 *
 * La regla nueva: los eventos de un mismo envío se envían en orden estricto
 * (uno trabado frena a los posteriores de ESE envío, no a los demás), y una
 * falla de red o del servidor nunca agota el evento: se reintenta con backoff
 * acotado. Sólo una respuesta que dice "este pedido está mal" (4xx no
 * transitorio) lo marca como falla permanente, y eso se le muestra al chofer.
 */

export type SyncFailureKind = 'transient' | 'permanent';

/** Lo mínimo de un evento de la cola que estas reglas necesitan. */
export type PlannableEvent = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
  retries: number;
  nextRetryAt?: number;
  /** Presente sólo si el servidor rechazó el pedido como inválido (4xx no transitorio). */
  permanentFailure?: { at: number; status: number | null };
};

export const BASE_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30_000;

/** Eventos de envío cuyo orden importa (el GPS no mueve estado). */
const ORDERED_SHIPMENT_TYPES: ReadonlySet<string> = new Set([
  'SHIPMENT_SCANNED',
  'SHIPMENT_IN_TRANSIT',
  'SHIPMENT_NEAR_DESTINATION',
  'SHIPMENT_DELIVERED',
  'SHIPMENT_FAILED',
]);

/** Estados HTTP 4xx que significan "probá de nuevo", no "el pedido está mal". */
const TRANSIENT_4XX: ReadonlySet<number> = new Set([401, 408, 409, 425, 429]);

/**
 * Clave de orden: los eventos con la misma clave se envían en orden estricto.
 * `null` = el evento no participa del orden (no frena ni es frenado).
 */
export function orderingKey(event: Pick<PlannableEvent, 'type' | 'payload'>): string | null {
  if (!ORDERED_SHIPMENT_TYPES.has(event.type)) {
    return null;
  }
  const p = event.payload;
  if (p === null || typeof p !== 'object') {
    return null;
  }
  const sid = (p as Record<string, unknown>).shipmentId;
  return typeof sid === 'string' && sid.trim() !== '' ? `shipment:${sid.trim()}` : null;
}

export function shipmentIdOf(event: Pick<PlannableEvent, 'type' | 'payload'>): string | null {
  const key = orderingKey(event);
  return key === null ? null : key.slice('shipment:'.length);
}

export function isPermanentlyFailed(event: Pick<PlannableEvent, 'permanentFailure'>): boolean {
  return event.permanentFailure != null;
}

/**
 * Clasifica el error de un envío a la API.
 *
 * - Sin respuesta (red caída, timeout, DNS) → transitoria.
 * - 5xx → transitoria: el servidor no pudo, el pedido puede estar bien.
 * - 401 → transitoria: la sesión venció; al volver a entrar se reenvía.
 * - 408/409/425/429 → transitorias por definición.
 * - Cualquier otro 4xx → permanente: reenviar lo mismo da lo mismo.
 * - Un error que no es de HTTP (payload mal armado en la app) → permanente.
 */
export function classifySyncFailure(err: unknown): SyncFailureKind {
  if (err === null || typeof err !== 'object') {
    return 'permanent';
  }
  const e = err as { isAxiosError?: unknown; response?: { status?: unknown } | null };
  if (e.isAxiosError !== true) {
    return 'permanent';
  }
  const status = typeof e.response?.status === 'number' ? e.response.status : null;
  if (status === null) {
    return 'transient';
  }
  if (status >= 500) {
    return 'transient';
  }
  if (status >= 400 && !TRANSIENT_4XX.has(status)) {
    return 'permanent';
  }
  return 'transient';
}

export function httpStatusOf(err: unknown): number | null {
  if (err === null || typeof err !== 'object') return null;
  const s = (err as { response?: { status?: unknown } | null }).response?.status;
  return typeof s === 'number' ? s : null;
}

/** Backoff exponencial acotado. Nunca agota el evento. */
export function backoffMsFor(retriesSoFar: number): number {
  const exp = Math.min(Math.max(0, retriesSoFar), 16);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exp);
}

/** Orden FIFO estable (createdAt, después id). */
export function fifo<T extends Pick<PlannableEvent, 'createdAt' | 'id'>>(queue: readonly T[]): T[] {
  return [...queue].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/**
 * Drena la cola respetando el orden por envío.
 *
 * `send` intenta un evento y devuelve `null` si salió bien o el tipo de falla.
 * Devuelve qué pasó con cada evento para que el llamador persista el resultado
 * (sacarlo de la cola, programar el reintento o marcar la falla permanente).
 *
 * Reglas:
 *  - un evento con falla permanente no se envía y NO frena a los posteriores
 *    (nunca se va a enviar; frenarlos trabaría el envío para siempre);
 *  - un evento en backoff, o que falló en esta pasada, frena a todos los
 *    posteriores con su misma clave hasta que salga;
 *  - los eventos sin clave se envían de forma independiente.
 */
export async function drainInOrder<T extends PlannableEvent>(
  queue: readonly T[],
  now: () => number,
  send: (event: T) => Promise<SyncFailureKind | null>,
): Promise<{ sent: T[]; failed: { event: T; kind: SyncFailureKind }[]; heldBack: T[] }> {
  const blocked = new Set<string>();
  const sent: T[] = [];
  const failed: { event: T; kind: SyncFailureKind }[] = [];
  const heldBack: T[] = [];

  for (const event of fifo(queue)) {
    if (isPermanentlyFailed(event)) {
      continue;
    }
    const key = orderingKey(event);
    if (key !== null && blocked.has(key)) {
      heldBack.push(event);
      continue;
    }
    if (event.nextRetryAt != null && now() < event.nextRetryAt) {
      if (key !== null) blocked.add(key);
      heldBack.push(event);
      continue;
    }

    const outcome = await send(event);
    if (outcome === null) {
      sent.push(event);
      continue;
    }
    failed.push({ event, kind: outcome });
    if (key !== null && outcome === 'transient') {
      blocked.add(key);
    }
  }

  return { sent, failed, heldBack };
}

/**
 * Eventos de envío que todavía no llegaron al servidor (excluye las fallas
 * permanentes, que ya no van a llegar). Finalizar la jornada con alguno de
 * estos pendiente haría que el servidor cierre como "no entregado" un envío
 * que el chofer sí entregó.
 */
export function pendingShipmentEvents<T extends PlannableEvent>(queue: readonly T[]): T[] {
  return queue.filter((e) => orderingKey(e) !== null && !isPermanentlyFailed(e));
}
