import * as Notifications from 'expo-notifications';
import { useCallback } from 'react';

import { cancelReminderForOrder } from '../lib/reminderScheduler';
import { usePickupOrderActiveStore } from '../store/pickupOrderActiveStore';

async function ensurePermission(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  if (status.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/**
 * Recordatorio local (no push desde el servidor). Programado con
 * expo-notifications.scheduleNotificationAsync. Se cancela cuando el chofer
 * arranca la colecta, la rechaza, al elegir "Sin recordatorio" o en logout.
 */
export function usePickupReminder() {
  const remindersByOrderId = usePickupOrderActiveStore((s) => s.remindersByOrderId);
  const setReminderFor = usePickupOrderActiveStore((s) => s.setReminderFor);

  const schedule = useCallback(
    async (params: {
      orderId: string;
      scheduledDate: string;
      scheduledTimeFrom: string | null;
      minutesBefore: number;
      warehouseName?: string | null;
    }): Promise<{ ok: boolean; reason?: 'no_time' | 'past' | 'denied' | 'error' }> => {
      if (!params.scheduledTimeFrom) return { ok: false, reason: 'no_time' };
      const [hh, mm] = params.scheduledTimeFrom.split(':').map((s) => Number(s));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return { ok: false, reason: 'no_time' };

      const dateOnly = params.scheduledDate.slice(0, 10);
      const [y, m, d] = dateOnly.split('-').map((s) => Number(s));
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
        return { ok: false, reason: 'no_time' };
      }
      const scheduled = new Date(y, m - 1, d, hh, mm, 0, 0);
      const trigger = new Date(scheduled.getTime() - params.minutesBefore * 60_000);
      if (trigger.getTime() <= Date.now()) return { ok: false, reason: 'past' };

      const granted = await ensurePermission();
      if (!granted) return { ok: false, reason: 'denied' };

      try {
        const existing = remindersByOrderId[params.orderId];
        if (existing) {
          await Notifications.cancelScheduledNotificationAsync(existing).catch(
            () => undefined,
          );
        }

        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Recordatorio de colecta',
            body:
              `Tenés colecta en ${params.minutesBefore} min` +
              (params.warehouseName ? ` — arrancás por ${params.warehouseName}` : ''),
          },
          // expo-notifications 0.32+ requiere `type` explícito en el trigger.
          // Sin él, scheduleNotificationAsync tira error (que antes se comía el catch).
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: trigger,
          },
        });
        setReminderFor(params.orderId, id);
        return { ok: true };
      } catch (e) {
        console.warn('[pickup-reminder] schedule failed', e);
        return { ok: false, reason: 'error' };
      }
    },
    [remindersByOrderId, setReminderFor],
  );

  const cancelFor = useCallback(async (orderId: string) => {
    await cancelReminderForOrder(orderId);
  }, []);

  const isScheduledFor = useCallback(
    (orderId: string) => remindersByOrderId[orderId] !== undefined,
    [remindersByOrderId],
  );

  return { schedule, cancelFor, isScheduledFor };
}
