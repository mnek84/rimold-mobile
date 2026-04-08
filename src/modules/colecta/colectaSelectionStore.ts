import { create } from 'zustand';

/** Active Colecta target: business (client) + warehouse. Both IDs are required for scanning. */
export type ColectaSelection = {
  clientId: string;
  clientName: string;
  warehouseId: string;
  warehouseName: string;
};

type State = {
  selection: ColectaSelection | null;
  setSelection: (value: ColectaSelection) => void;
  clearSelection: () => void;
};

export const useColectaSelectionStore = create<State>((set) => ({
  selection: null,
  setSelection: (value) => set({ selection: value }),
  clearSelection: () => set({ selection: null }),
}));
