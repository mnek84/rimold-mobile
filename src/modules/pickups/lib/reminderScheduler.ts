import * as Notifications from 'expo-notifications';

import { usePickupOrderActiveStore } from '../store/pickupOrderActiveStore';

/**
 * Cancela el recordatorio local programado para una orden puntual (si existe)
 * y limpia el mapeo del store. Silencioso ante errores: la ausencia del notif
 * en el sistema no debe romper el flujo.
 */
export async function cancelReminderForOrder(orderId: string): Promise<void> {
  const store = usePickupOrderActiveStore.getState();
  const id = store.getReminderIdFor(orderId);
  if (id == null) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  store.clearReminderFor(orderId);
}

/**
 * Cancela todos los recordatorios locales de pickup pendientes. Usado en logout
 * para no dejar notificaciones huérfanas de otro usuario en el dispositivo.
 */
export async function cancelAllPickupReminders(): Promise<void> {
  const store = usePickupOrderActiveStore.getState();
  const ids = Object.values(store.remindersByOrderId);
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined),
    ),
  );
  store.clearAllReminders();
}
