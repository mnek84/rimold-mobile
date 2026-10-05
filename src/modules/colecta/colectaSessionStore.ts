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
  /**
   * Identidad del bulto escaneado. Ausente en ítems persistidos antes del
   * modelo por bulto, y en escaneos cuyo código no identifica uno.
   */
  packageCode?: string;
  packageIndex?: number;
  packageTotal?: number;
};

/**
 * Clave con la que se deduplica dentro de la sesión.
 *
 * Los N bultos de un envío comparten tracking, así que deduplicar por tracking
 * descartaría el bulto 2 como repetido del 1. Con código de bulto se usa ese;
 * sin él se cae al tracking, que es el comportamiento previo.
 */
export function colectaItemKey(item: Pick<ColectaSessionItem, 'trackingId' | 'packageCode'>): string {
  return item.packageCode ?? item.trackingId;
}

/** Bultos escaneados de un envío dentro de la sesión abierta. */
export function scannedCountForTracking(items: ColectaSessionItem[], trackingId: string): number {
  return items.filter((i) => i.trackingId === trackingId).length;
}

/** Contexto opcional cuando el scan sucede dentro de un PickupStop (nuevo flujo de colectas). */
export type PickupScanContext = {
  orderId: string;
  stopId: string;
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
  /** Cuando se está escaneando desde una PickupOrder — el finalizar cierra el stop. */
  pickupContext: PickupScanContext | null;
  /** New session UUID and empty items (call when starting a different client/depósito). */
  startNewSession: (selection: ColectaSelection) => void;
  /**
   * Inicializar la sesión desde una PickupOrder (collectionId viene del backend,
   * no se genera localmente; COLLECTION_STARTED ya fue emitido por el server).
   */
  initFromPickup: (params: {
    collectionId: string;
    clientId: string;
    clientName: string;
    warehouseId: string;
    warehouseName: string;
    pickupContext: PickupScanContext;
  }) => void;
  /** Append scan if not duplicate (deduped by bulto when the scan identifies one). */
  addScannedItem: (
    trackingId: string,
    source: ColectaScanSource,
    pkg?: { code: string; index: number; total: number } | null,
  ) => void;
  /** Remove a scanned item from the open session (long-press flow). */
  removeScannedItem: (key: string) => void;
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
  pickupContext: null as PickupScanContext | null,
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
          pickupContext: null,
        }),
      initFromPickup: (params) =>
        set({
          collectionId: params.collectionId,
          clientId: params.clientId,
          clientName: params.clientName,
          warehouseId: params.warehouseId,
          warehouseName: params.warehouseName,
          items: [],
          // Backend ya emitió COLLECTION_STARTED en StartScanningStopAction.
          collectionStartedEmitted: true,
          pickupContext: params.pickupContext,
        }),
      addScannedItem: (trackingId, source, pkg) =>
        set((state) => {
          const incoming: ColectaSessionItem = {
            trackingId,
            source,
            ...(pkg != null
              ? { packageCode: pkg.code, packageIndex: pkg.index, packageTotal: pkg.total }
              : {}),
          };
          const key = colectaItemKey(incoming);
          if (state.items.some((i) => colectaItemKey(i) === key)) {
            return state;
          }
          return { items: [...state.items, incoming] };
        }),
      removeScannedItem: (key) =>
        set((state) => ({
          items: state.items.filter((i) => colectaItemKey(i) !== key),
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
        pickupContext: s.pickupContext,
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
