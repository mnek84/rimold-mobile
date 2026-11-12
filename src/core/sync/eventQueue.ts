/**
 * Offline event queue: all reads/writes go through a single serialized gate.
 * Corrupt top-level JSON is never silently replaced with an empty queue.
 * Malformed array elements are moved to `event_queue_quarantine` before rewriting the main list.
 */
import { getItem, getJSON, setJSON } from '@core/storage';

import { backoffMsFor, type SyncFailureKind } from './drainPlan';
import { normalizeEventId } from './eventId';

export type QueueEvent = {
  /** UUID v4; sent as `Idempotency-Key` when syncing so retries are deduped server-side. */
  id: string;
  type: string;
  payload: any;
  createdAt: number;
  retries: number;
  /** When set, `processQueue` skips this event until this timestamp (ms since epoch). */
  nextRetryAt?: number;
  /**
   * El servidor rechazó el pedido como inválido (4xx no transitorio). No se
   * reenvía más y se le muestra al chofer. Una falla de red NUNCA llega acá.
   */
  permanentFailure?: { at: number; status: number | null };
};

/**
 * Umbral histórico de reintentos. Ya NO descarta eventos: una falla de red se
 * reintenta siempre (ver `drainPlan.ts`). Queda para la advertencia de la UI.
 */
export const QUEUE_MAX_RETRIES = 5;

const STORAGE_KEY = 'event_queue';
const QUARANTINE_KEY = 'event_queue_quarantine';

/** Input for new events; id / createdAt / retries are filled in when omitted. */
export type QueueEventInput = {
  id?: string;
  type: string;
  payload: any;
  createdAt?: number;
  retries?: number;
};

/** Thrown when on-disk queue cannot be parsed; existing bytes are not overwritten automatically. */
export class QueuePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueuePersistenceError';
  }
}

function isValidQueueEvent(value: unknown): value is QueueEvent {
  if (value === null || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.length === 0) return false;
  if (typeof e.type !== 'string' || e.type.length === 0) return false;
  if (typeof e.createdAt !== 'number' || !Number.isFinite(e.createdAt)) return false;
  if (typeof e.retries !== 'number' || !Number.isFinite(e.retries) || e.retries < 0) return false;
  if (!('payload' in e)) return false;
  if (
    e.nextRetryAt !== undefined &&
    (typeof e.nextRetryAt !== 'number' || !Number.isFinite(e.nextRetryAt))
  ) {
    return false;
  }
  if (e.permanentFailure !== undefined && (e.permanentFailure === null || typeof e.permanentFailure !== 'object')) {
    return false;
  }
  return true;
}

function coerceQueueEvent(e: QueueEvent): QueueEvent {
  return {
    id: e.id,
    type: e.type,
    payload: e.payload,
    createdAt: Math.trunc(e.createdAt),
    retries: Math.max(0, Math.trunc(e.retries)),
    nextRetryAt:
      e.nextRetryAt !== undefined && Number.isFinite(e.nextRetryAt)
        ? Math.trunc(e.nextRetryAt as number)
        : undefined,
    // Se conserva: sin esto, cada lectura de la cola "revivía" una falla permanente.
    ...(e.permanentFailure != null
      ? {
          permanentFailure: {
            at: Number(e.permanentFailure.at) || 0,
            status: typeof e.permanentFailure.status === 'number' ? e.permanentFailure.status : null,
          },
        }
      : {}),
  };
}

async function appendQuarantine(entries: unknown[]): Promise<void> {
  if (entries.length === 0) return;
  const prev = await getJSON<unknown[]>(QUARANTINE_KEY);
  const base = Array.isArray(prev) ? prev : [];
  await setJSON(QUARANTINE_KEY, [...base, ...entries]);
}

async function loadQueue(): Promise<QueueEvent[]> {
  const rawStr = await getItem(STORAGE_KEY);
  if (rawStr === null || rawStr === '') {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStr);
  } catch {
    throw new QueuePersistenceError(
      'Stored event queue is not valid JSON. Fix storage or restore from backup.',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new QueuePersistenceError(
      'Stored event queue must be a JSON array. Fix storage or restore from backup.',
    );
  }

  const valid: QueueEvent[] = [];
  const invalid: unknown[] = [];
  for (const item of parsed) {
    if (isValidQueueEvent(item)) {
      valid.push(coerceQueueEvent(item));
    } else {
      invalid.push(item);
    }
  }

  if (invalid.length > 0) {
    await appendQuarantine(invalid);
    await saveQueue(valid);
  }

  return valid;
}

async function saveQueue(queue: QueueEvent[]): Promise<void> {
  await setJSON(STORAGE_KEY, queue);
}

/**
 * Serializes all mutations so read-modify-write cannot interleave (AsyncStorage has no transactions).
 */
let gate = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = gate.then(fn);
  gate = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Append-only FIFO: new events go to the end; consumers process from the start.
 */
export async function addEvent(input: QueueEventInput): Promise<QueueEvent> {
  return runExclusive(async () => {
    const queue = await loadQueue();
    const event: QueueEvent = {
      id: normalizeEventId(input.id),
      type: input.type,
      payload: input.payload,
      createdAt: input.createdAt ?? Date.now(),
      retries: input.retries ?? 0,
    };
    await saveQueue([...queue, event]);
    return event;
  });
}

/** Snapshot of the queue in FIFO order (oldest first). */
export async function getQueue(): Promise<QueueEvent[]> {
  return runExclusive(async () => {
    const queue = await loadQueue();
    return [...queue].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  });
}

export async function removeEvent(id: string): Promise<void> {
  return runExclusive(async () => {
    const queue = await loadQueue();
    const next = queue.filter((e) => e.id !== id);
    if (next.length === queue.length) {
      return;
    }
    await saveQueue(next);
  });
}

export async function incrementRetries(id: string): Promise<void> {
  return runExclusive(async () => {
    const queue = await loadQueue();
    let changed = false;
    const next = queue.map((e) => {
      if (e.id !== id) return e;
      changed = true;
      return { ...e, retries: e.retries + 1 };
    });
    if (!changed) {
      return;
    }
    await saveQueue(next);
  });
}

/**
 * Registra una falla de envío.
 *
 * - `transient` (red, 5xx, sesión vencida): reintento con backoff acotado, sin
 *   tope de intentos. Antes, a los 5 intentos el evento quedaba abandonado.
 * - `permanent` (4xx no transitorio): se marca y no se reenvía.
 */
export async function recordFailure(
  id: string,
  kind: SyncFailureKind = 'transient',
  httpStatus: number | null = null,
): Promise<void> {
  return runExclusive(async () => {
    const queue = await loadQueue();
    let changed = false;
    const now = Date.now();
    const next = queue.map((e) => {
      if (e.id !== id) return e;
      changed = true;
      if (kind === 'permanent') {
        return { ...e, retries: e.retries + 1, nextRetryAt: undefined, permanentFailure: { at: now, status: httpStatus } };
      }
      return { ...e, retries: e.retries + 1, nextRetryAt: now + backoffMsFor(e.retries) };
    });
    if (!changed) {
      return;
    }
    await saveQueue(next);
  });
}

export const eventQueue = {
  addEvent,
  getQueue,
  removeEvent,
  incrementRetries,
  recordFailure,
};
