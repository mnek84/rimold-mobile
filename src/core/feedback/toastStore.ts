import { create } from 'zustand';

type ToastSlice = {
  message: string | null;
  visible: boolean;
  show: (message: string) => void;
};

let hideTimer: ReturnType<typeof setTimeout> | undefined;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastSlice>((set) => ({
  message: null,
  visible: false,
  show: (message: string) => {
    if (hideTimer !== undefined) clearTimeout(hideTimer);
    if (clearTimer !== undefined) clearTimeout(clearTimer);
    set({ message, visible: true });
    hideTimer = setTimeout(() => {
      set({ visible: false });
      clearTimer = setTimeout(() => set({ message: null }), 280);
    }, 2200);
  },
}));

/** Short, non-blocking message (e.g. sync feedback). */
export function showToast(message: string): void {
  useToastStore.getState().show(message);
}
