import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Rastrea la orden activa del chofer (para restaurar recorrido al reabrir la app)
 * y los ids de notificaciones locales de recordatorios programados, indexados por
 * orderId. Un chofer puede tener varios recordatorios en distintas colectas del día.
 */
type State = {
  activeOrderId: string | null;
  remindersByOrderId: Record<string, string>;
};

type Actions = {
  setActiveOrder(orderId: string | null): void;
  setReminderFor(orderId: string, notificationId: string): void;
  clearReminderFor(orderId: string): void;
  clearAllReminders(): void;
  getReminderIdFor(orderId: string): string | null;
  clearAll(): void;
};

type LegacyV1 = {
  activeOrderId?: string | null;
  reminderOrderId?: string | null;
  reminderNotificationId?: string | null;
};

export const usePickupOrderActiveStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      activeOrderId: null,
      remindersByOrderId: {},

      setActiveOrder(orderId) {
        set({ activeOrderId: orderId });
      },
      setReminderFor(orderId, notificationId) {
        set((s) => ({
          remindersByOrderId: { ...s.remindersByOrderId, [orderId]: notificationId },
        }));
      },
      clearReminderFor(orderId) {
        set((s) => {
          if (!(orderId in s.remindersByOrderId)) return s;
          const next = { ...s.remindersByOrderId };
          delete next[orderId];
          return { remindersByOrderId: next };
        });
      },
      clearAllReminders() {
        set({ remindersByOrderId: {} });
      },
      getReminderIdFor(orderId) {
        return get().remindersByOrderId[orderId] ?? null;
      },
      clearAll() {
        set({ activeOrderId: null, remindersByOrderId: {} });
      },
    }),
    {
      name: 'pickup-order-active-v1',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate(persisted, version): State {
        if (version < 2) {
          const legacy = (persisted ?? {}) as LegacyV1;
          const reminders: Record<string, string> = {};
          if (
            typeof legacy.reminderOrderId === 'string' &&
            typeof legacy.reminderNotificationId === 'string'
          ) {
            reminders[legacy.reminderOrderId] = legacy.reminderNotificationId;
          }
          return {
            activeOrderId: legacy.activeOrderId ?? null,
            remindersByOrderId: reminders,
          };
        }
        return persisted as State;
      },
    },
  ),
);
