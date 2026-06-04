import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createEventUuid } from '@core/sync/eventId';

import type { ColectaSelection } from './colectaSelectionStore';

export type ColectaScanSource = 'flex' | 'interno' | 'externo';

export type ColectaSessionItem = {
  trackingId: string;
  /** Ausente en ítems persistidos antes de agregar origen (colecta). */
  source?: ColectaScanSource;
};

type State = {
  collectionId: string | null;
  clientId: string;
  clientName: string;
  warehouseId: string;
  warehouseName: string;
  items: ColectaSessionItem[];
  /** True after COLLECTION_STARTED was enqueued (primer paquete escaneado en esta sesión). */
  collectionStartedEmitted: boolean;
  /** New session UUID and empty items (call when starting a different client/depósito). */
  startNewSession: (selection: ColectaSelection) => void;
  /** Append scan if not duplicate. */
  addScannedItem: (trackingId: string, source: ColectaScanSource) => void;
  /** Remove a scanned item from the open session (long-press flow). */
  removeScannedItem: (trackingId: string) => void;
  /** Drop session after COLLECTION_FINISHED or logout. */
  clearSession: () => void;
  markCollectionStartedEmitted: () => void;
};

const emptySession = {
  collectionId: null as string | null,
  clientId: '',
  clientName: '',
  warehouseId: '',
  warehouseName: '',
  items: [] as ColectaSessionItem[],
  collectionStartedEmitted: false,
};

export const useColectaSessionStore = create<State>()(
  persist(
    (set) => ({
      ...emptySession,
      startNewSession: (selection) =>
        set({
          collectionId: createEventUuid(),
          clientId: selection.clientId,
          clientName: selection.clientName,
          warehouseId: selection.warehouseId,
          warehouseName: selection.warehouseName,
          items: [],
          collectionStartedEmitted: false,
        }),
      addScannedItem: (trackingId, source) =>
        set((state) => {
          if (state.items.some((i) => i.trackingId === trackingId)) {
            return state;
          }
          return { items: [...state.items, { trackingId, source }] };
        }),
      removeScannedItem: (trackingId) =>
        set((state) => ({
          items: state.items.filter((i) => i.trackingId !== trackingId),
        })),
      clearSession: () => set({ ...emptySession }),
      markCollectionStartedEmitted: () => set({ collectionStartedEmitted: true }),
    }),
    {
      name: 'colecta-session-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        collectionId: s.collectionId,
        clientId: s.clientId,
        clientName: s.clientName,
        warehouseId: s.warehouseId,
        warehouseName: s.warehouseName,
        items: s.items,
        collectionStartedEmitted: s.collectionStartedEmitted,
      }),
    },
  ),
);

/** True si ya hay sesión abierta para otro cliente o depósito. */
export function colectaSessionConflictsWith(selection: ColectaSelection): boolean {
  const s = useColectaSessionStore.getState();
  if (s.collectionId == null) {
    return false;
  }
  return s.clientId !== selection.clientId || s.warehouseId !== selection.warehouseId;
}
