import NetInfo from '@react-native-community/netinfo';

import { isOnline } from '@core/sync/syncEngine';

import {
  deletePendingByIds,
  markPendingBatchFailed,
  selectPendingBatchForSync,
} from './driverLocationDb';
import { postDriverLocationBatch } from './driverLocationApi';

const SYNC_INTERVAL_MS = 10_000;
const BATCH_MAX = 20;

let intervalId: ReturnType<typeof setInterval> | null = null;
let netUnsub: (() => void) | null = null;
let chain = Promise.resolve();

function runExclusive(fn: () => Promise<void>): Promise<void> {
  const next = chain.then(fn);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function syncDriverLocationQueueOnce(): Promise<void> {
  if (!(await isOnline())) {
    return;
  }

  await runExclusive(async () => {
    const now = Date.now();
    const batch = await selectPendingBatchForSync(now, BATCH_MAX);
    if (batch.length === 0) {
      return;
    }

    const attemptsById: Record<string, number> = {};
    for (const r of batch) {
      attemptsById[r.id] = r.attempts;
    }

    try {
      await postDriverLocationBatch(batch);
      await deletePendingByIds(batch.map((b) => b.id));
    } catch {
      await markPendingBatchFailed(
        batch.map((b) => b.id),
        attemptsById,
      );
    }
  });
}

export function startDriverLocationSyncWorker(): void {
  if (intervalId != null) {
    return;
  }
  void syncDriverLocationQueueOnce();
  intervalId = setInterval(() => {
    void syncDriverLocationQueueOnce();
  }, SYNC_INTERVAL_MS);

  if (netUnsub === null) {
    netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected === true && state.isInternetReachable !== false) {
        void syncDriverLocationQueueOnce();
      }
    });
  }
}

export function stopDriverLocationSyncWorker(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (netUnsub != null) {
    netUnsub();
    netUnsub = null;
  }
}
