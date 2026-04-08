import NetInfo from '@react-native-community/netinfo';
import { InteractionManager } from 'react-native';

import { showToast } from '@core/feedback/toastStore';

import {
  addEvent,
  getQueue,
  QUEUE_MAX_RETRIES,
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

    for (const event of queue) {
      if (event.retries >= QUEUE_MAX_RETRIES) {
        continue;
      }
      if (event.nextRetryAt != null && Date.now() < event.nextRetryAt) {
        continue;
      }

      try {
        await handleEvent(event);
        await removeEvent(event.id);
        successCount += 1;
      } catch {
        await recordFailure(event.id);
      }
    }
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

/** Runs {@link processQueue} after the current interaction/animation batch (keeps UI responsive). */
export function scheduleProcessQueue(): void {
  InteractionManager.runAfterInteractions(() => {
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
  InteractionManager.runAfterInteractions(() => {
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
