import { create } from 'zustand';

export type AdminMessageType = 'info' | 'warning' | 'urgent' | 'custom';

export type AdminMessage = {
  id: string;
  type: AdminMessageType;
  title: string;
  body: string;
  sentAt?: string | null;
};

type AdminMessagesState = {
  /** IDs vistos recientemente (dedup entre push y Reverb). */
  seen: Set<string>;
  /** Mensaje urgente actualmente visible; null cuando no hay ninguno abierto. */
  currentUrgent: AdminMessage | null;
  /**
   * Punto único de entrada: filtra por id, actualiza estado y — si es urgent —
   * lo pone al frente. Devuelve true si el mensaje fue nuevo (para que el caller
   * pueda emitir una notif local o toast).
   */
  handleMessage: (msg: AdminMessage) => boolean;
  dismissUrgent: () => void;
};

// Limite defensivo para que el Set no crezca sin fin.
const MAX_SEEN = 200;

export const useAdminMessagesStore = create<AdminMessagesState>((set, get) => ({
  seen: new Set<string>(),
  currentUrgent: null,

  handleMessage: (msg) => {
    const { seen } = get();
    if (seen.has(msg.id)) return false;

    const nextSeen = new Set(seen);
    nextSeen.add(msg.id);
    if (nextSeen.size > MAX_SEEN) {
      // Trim del más viejo (Set mantiene orden de inserción).
      const it = nextSeen.values().next();
      if (!it.done) nextSeen.delete(it.value);
    }

    set({
      seen: nextSeen,
      currentUrgent: msg.type === 'urgent' ? msg : get().currentUrgent,
    });

    return true;
  },

  dismissUrgent: () => set({ currentUrgent: null }),
}));
