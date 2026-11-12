import NetInfo from '@react-native-community/netinfo';

import { showToast } from '@core/feedback/toastStore';

import {
  classifySyncFailure,
  drainInOrder,
  httpStatusOf,
  isPermanentlyFailed,
  orderingKey,
  pendingShipmentEvents,
} from './drainPlan';
import {
  addEvent,
  getQueue,
  QueuePersistenceError,
  recordFailure,
  removeEvent,
  type QueueEvent,
  type QueueEventInput,
} from './eventQueue';
import { handleEvent } from './handleEvent';
import { useSyncStatusStore } from './syncStatusStore';

let processChain = Promise.resolve();

/** Avoid spamming the same offline hint when many events enqueue while disconnected. */
let lastOfflineEnqueueToastAt = 0;
const OFFLINE_ENQUEUE_TOAST_COOLDOWN_MS = 5000;

async function drainOnce(): Promise<void> {
  const status = useSyncStatusStore.getState();
  status.setSyncing(true);
  let successCount = 0;
  try {
    let queue: QueueEvent[];
    try {
      queue = await getQueue();
    } catch (e) {
      if (e instanceof QueuePersistenceError) {
        return;
      }
      throw e;
    }

    // Orden estricto por envío y sin abandono por fallas de red: ver drainPlan.ts.
    await drainInOrder(queue, Date.now, async (event) => {
      try {
        await handleEvent(event);
      } catch (err) {
        const kind = classifySyncFailure(err);
        await recordFailure(event.id, kind, httpStatusOf(err));
        return kind;
      }
      await removeEvent(event.id);
      successCount += 1;
      return null;
    });
  } finally {
    status.setSyncing(false);
    try {
      await status.refresh();
    } catch {
      /* Avoid clobbering UI with zeros if the queue cannot be read. */
    }
    if (successCount > 0) {
      await status.recordSuccessfulFlush();
      showToast('Sincronizado');
    }
  }
}

/**
 * Loads the offline queue (FIFO) and processes each eligible event.
 * Serialized so overlapping calls do not run in parallel.
 * Returns a promise; use `void processQueue()` or {@link scheduleProcessQueue} so the UI never awaits it.
 */
export function processQueue(): Promise<void> {
  const run = processChain.then(() => drainOnce());
  processChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Runs {@link processQueue} once the JS thread is idle (keeps UI responsive). */
export function scheduleProcessQueue(): void {
  requestIdleCallback(() => {
    void processQueue();
  });
}

export async function isOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  if (s.isConnected !== true) return false;
  if (s.isInternetReachable === false) return false;
  return true;
}

/**
 * Runs {@link processQueue} only when the device appears to have connectivity.
 * Still serialized with other {@link processQueue} calls (no parallel drains).
 */
export async function processQueueIfOnline(): Promise<void> {
  if (!(await isOnline())) return;
  return processQueue();
}

export function scheduleProcessQueueIfOnline(): void {
  requestIdleCallback(() => {
    void processQueueIfOnline();
  });
}

/** Persists an event then attempts sync when online (same serialization as {@link processQueue}). */
export async function enqueueEvent(input: QueueEventInput): Promise<QueueEvent> {
  const event = await addEvent(input);
  void useSyncStatusStore.getState().refresh();
  const online = await isOnline();
  if (!online) {
    const now = Date.now();
    if (now - lastOfflineEnqueueToastAt >= OFFLINE_ENQUEUE_TOAST_COOLDOWN_MS) {
      lastOfflineEnqueueToastAt = now;
      showToast('Sin conexión, guardando cambios');
    }
  }
  void processQueueIfOnline();
  return event;
}

export type UnsyncedShipmentWork = {
  /** Eventos de envío que todavía no llegaron al servidor. */
  pending: number;
  /** Eventos de envío que el servidor rechazó como inválidos. */
  failed: number;
};

/**
 * Intenta vaciar la cola y devuelve lo que quedó sin llegar al servidor.
 *
 * Se usa antes de finalizar la jornada: si una entrega confirmada sin señal
 * sigue en la cola, el cierre de ruta la registraría como "no entregada" y el
 * evento de entrega llegaría tarde a un envío ya fallido.
 */
export async function flushAndCountUnsyncedShipmentWork(): Promise<UnsyncedShipmentWork> {
  await processQueueIfOnline();
  const queue = await getQueue();
  return {
    pending: pendingShipmentEvents(queue).length,
    failed: queue.filter((e) => orderingKey(e) !== null && isPermanentlyFailed(e)).length,
  };
}
