import NetInfo from '@react-native-community/netinfo';

import { isOnline } from '@core/sync/syncEngine';

import {
  deletePendingByIds,
  deletePendingOlderThan,
  markPendingBatchFailed,
  selectPendingBatchForSync,
} from './driverLocationDb';
import { postDriverLocationBatch } from './driverLocationApi';

const SYNC_INTERVAL_MS = 10_000;
/** Matches `StoreDriverLocationBatchAction::MAX_BATCH` on the backend. */
const BATCH_MAX = 50;
/** Server-side point history lives 24 h; older fixes are dead weight. */
const MAX_POINT_AGE_MS = 24 * 60 * 60 * 1000;

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
    await deletePendingOlderThan(now - MAX_POINT_AGE_MS);
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
