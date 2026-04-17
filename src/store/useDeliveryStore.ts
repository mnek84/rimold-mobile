import { create } from 'zustand';

type DeliveryState = {
  /** Total shipments for today (updated after each load). */
  totalShipments: number;
  /** Route ID for the driver's internal (non-flex) route, if any. */
  internalRouteId: string | null;
  setDeliveryData: (totalShipments: number, internalRouteId: string | null) => void;
};

export const useDeliveryStore = create<DeliveryState>((set) => ({
  totalShipments: 0,
  internalRouteId: null,
  setDeliveryData: (totalShipments, internalRouteId) => set({ totalShipments, internalRouteId }),
}));
