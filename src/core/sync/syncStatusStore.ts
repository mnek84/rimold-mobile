import { create } from 'zustand';

import { getJSON, setJSON } from '@core/storage';

import { isPermanentlyFailed } from './drainPlan';
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
  /** Eventos que el servidor rechazó como inválidos: no se van a reenviar. */
  permanentFailureCount: number;

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
  permanentFailureCount: 0,

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
      const failed = q.filter(isPermanentlyFailed).length;
      set({
        pendingCount: q.length - failed,
        warningRetryCount: q.filter((e) => !isPermanentlyFailed(e) && e.retries >= RETRY_WARNING_THRESHOLD).length,
        permanentFailureCount: failed,
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
