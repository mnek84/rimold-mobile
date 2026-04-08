import { create } from 'zustand';

type AppState = {
  ready: boolean;
  setReady: (ready: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  ready: true,
  setReady: (ready) => set({ ready }),
}));
