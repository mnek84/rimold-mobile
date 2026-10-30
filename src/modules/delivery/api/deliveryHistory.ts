import { apiClient } from '@core/api';

/** Desenlace de la visita, tal como lo resuelve el backend desde el evento. */
export type DeliveryOutcome = 'delivered' | 'not_delivered';

export type DeliveryHistoryItem = {
  id: string;
  trackingId: string;
  address: string;
  outcome: DeliveryOutcome;
  /** Código de estado del evento que cerró la visita ('delivered' | 'returned' | 'failed'). */
  status: string;
  /** ISO timestamp del hecho (`shipment_history_events.occurred_at`). */
  occurredAt: string;
  /** Número de salida a reparto. 1 = primer intento. */
  attempt: number;
  /** Motivo del fallo, sólo cuando se registró ese mismo día. */
  failureReason: string | null;
  failureNote: string | null;
};

export type DeliveryHistoryDay = {
  /** Día local en formato YYYY-MM-DD. */
  date: string;
  deliveredCount: number;
  notDeliveredCount: number;
  shipments: DeliveryHistoryItem[];
};

export type DeliveryHistoryResponse = {
  /** Mes efectivo devuelto por el server (YYYY-MM). Puede diferir del pedido si estaba mal formateado. */
  month: string;
  /** Día efectivo (YYYY-MM-DD) si se pidió uno solo; null si se pidió el mes. */
  day: string | null;
  days: DeliveryHistoryDay[];
};

type RawItem = {
  id?: unknown;
  trackingId?: unknown;
  address?: unknown;
  outcome?: unknown;
  status?: unknown;
  occurredAt?: unknown;
  deliveredAt?: unknown;
  attempt?: unknown;
  failureReason?: unknown;
  failureNote?: unknown;
};

type RawDay = {
  date?: unknown;
  deliveredCount?: unknown;
  notDeliveredCount?: unknown;
  totalDeliveries?: unknown;
  shipments?: unknown;
};

type RawResponse = {
  month?: unknown;
  day?: unknown;
  days?: unknown;
};

const DELIVERED_STATUSES = new Set(['delivered', 'returned']);

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function parseItem(value: unknown): DeliveryHistoryItem | null {
  if (value === null || typeof value !== 'object') return null;
  const o = value as RawItem;
  const id = stringOrNull(o.id);
  // `deliveredAt` es el nombre viejo del mismo instante; se acepta para que la
  // app siga leyendo una respuesta de un backend sin desplegar.
  const occurredAt = stringOrNull(o.occurredAt) ?? stringOrNull(o.deliveredAt);
  if (id === null || occurredAt === null) return null;

  const status = typeof o.status === 'string' ? o.status : 'delivered';
  // Si el backend no manda `outcome`, se deriva del estado: un backend viejo
  // sólo devolvía entregas, así que la derivación da el mismo resultado.
  const rawOutcome = stringOrNull(o.outcome);
  const outcome: DeliveryOutcome =
    rawOutcome === 'delivered' || rawOutcome === 'not_delivered'
      ? rawOutcome
      : DELIVERED_STATUSES.has(status.trim().toLowerCase())
        ? 'delivered'
        : 'not_delivered';

  return {
    id,
    trackingId: stringOrNull(o.trackingId) ?? '',
    address: typeof o.address === 'string' ? o.address : '',
    outcome,
    status,
    occurredAt,
    attempt: Math.max(1, toNonNegativeInt(o.attempt)),
    failureReason: stringOrNull(o.failureReason),
    failureNote: stringOrNull(o.failureNote),
  };
}

function parseDay(value: unknown): DeliveryHistoryDay | null {
  if (value === null || typeof value !== 'object') return null;
  const o = value as RawDay;
  const date = stringOrNull(o.date);
  if (date === null) return null;

  const shipments: DeliveryHistoryItem[] = [];
  if (Array.isArray(o.shipments)) {
    for (const item of o.shipments) {
      const parsed = parseItem(item);
      if (parsed !== null) shipments.push(parsed);
    }
  }

  // Los contadores se recuentan sobre lo que efectivamente se pudo parsear, en
  // vez de confiar en los del server: si una fila se descartó, el encabezado
  // del día diría un número que no coincide con la lista que está debajo.
  const deliveredCount = shipments.filter((s) => s.outcome === 'delivered').length;

  return {
    date,
    deliveredCount,
    notDeliveredCount: shipments.length - deliveredCount,
    shipments,
  };
}

/**
 * GET /shipments/history — reporte de la jornada del chofer autenticado:
 * entregados y NO entregados, agrupados por día local (más reciente primero).
 *
 * Sin parámetros devuelve el mes actual del server. `day` tiene precedencia
 * sobre `month` y acota a una sola jornada.
 */
export async function fetchDeliveryHistory(params?: {
  month?: string;
  day?: string;
  signal?: AbortSignal;
}): Promise<DeliveryHistoryResponse> {
  const query: Record<string, string> = {};
  if (params?.day != null && params.day !== '') {
    query.day = params.day;
  } else if (params?.month != null && params.month !== '') {
    query.month = params.month;
  }

  const { data } = await apiClient.get<RawResponse>('/shipments/history', {
    params: Object.keys(query).length > 0 ? query : undefined,
    signal: params?.signal,
  });

  if (data === null || typeof data !== 'object') {
    return { month: params?.month ?? '', day: params?.day ?? null, days: [] };
  }

  const days: DeliveryHistoryDay[] = [];
  if (Array.isArray(data.days)) {
    for (const d of data.days) {
      const parsed = parseDay(d);
      if (parsed !== null) days.push(parsed);
    }
  }

  return {
    month: stringOrNull(data.month) ?? params?.month ?? '',
    day: stringOrNull(data.day) ?? params?.day ?? null,
    days,
  };
}
