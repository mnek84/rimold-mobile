import { create } from 'zustand';

import { getJSON, setJSON } from '@core/storage';

import { getQueue } from './eventQueue';

const LAST_SYNC_KEY = 'last_sync_at_ms';

/** Show a warning when queued events have at least this many retries. */
export const RETRY_WARNING_THRESHOLD = 3;

type SyncStatusState = {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
  /** Queue events with `retries >= RETRY_WARNING_THRESHOLD`. */
  warningRetryCount: number;

  hydrateFromStorage: () => Promise<void>;
  refresh: () => Promise<void>;
  setSyncing: (value: boolean) => void;
  recordSuccessfulFlush: () => Promise<void>;
};

export const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
  pendingCount: 0,
  isSyncing: false,
  lastSyncAt: null,
  warningRetryCount: 0,

  hydrateFromStorage: async () => {
    const t = await getJSON<number>(LAST_SYNC_KEY);
    if (typeof t === 'number' && !Number.isNaN(t)) {
      set({ lastSyncAt: t });
    }
    await get().refresh();
  },

  refresh: async () => {
    try {
      const q = await getQueue();
      set({
        pendingCount: q.length,
        warningRetryCount: q.filter((e) => e.retries >= RETRY_WARNING_THRESHOLD).length,
      });
    } catch {
      /* Keep previous counts; do not assume an empty queue on read failure. */
    }
  },

  setSyncing: (isSyncing) => set({ isSyncing }),

  recordSuccessfulFlush: async () => {
    const now = Date.now();
    await setJSON(LAST_SYNC_KEY, now);
    set({ lastSyncAt: now });
  },
}));
