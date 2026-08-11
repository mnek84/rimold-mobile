import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { pickupOrderKeys } from '@modules/pickups/hooks/usePickupOrders';
import { useAuthStore } from '@store/useAuthStore';

import { registerForPushNotifications } from '../lib/registerForPushNotifications';
import {
  useAdminMessagesStore,
  type AdminMessage,
  type AdminMessageType,
} from '../state/adminMessagesStore';
import { useAdminMessageChannel } from './useAdminMessageChannel';

type NotificationDataShape = {
  type?: string;
  notification_type?: string;
  notification_id?: string;
  payload?: unknown;
};

const ADMIN_TYPES: readonly AdminMessageType[] = ['info', 'warning', 'urgent', 'custom'];

function extractAdminMessage(
  data: NotificationDataShape | null | undefined,
  title: string | null | undefined,
  body: string | null | undefined,
): AdminMessage | null {
  if (data?.type !== 'admin_message') return null;
  if (!data.notification_id) return null;

  const rawType = data.notification_type as AdminMessageType | undefined;
  const type = rawType && ADMIN_TYPES.includes(rawType) ? rawType : 'info';

  return {
    id: String(data.notification_id),
    type,
    title: title ?? '',
    body: body ?? '',
  };
}

/**
 * Escucha notificaciones push mientras el usuario está autenticado:
 *  - Registra el ExpoPushToken en el backend al primer mount autenticado.
 *  - Cuando llega un push con `data.type === 'pickup_assigned'`, invalida las
 *    queries de pickup orders para refrescar el listado sin esperar al polling.
 *  - Cuando llega un push con `data.type === 'admin_message'`, delega en la
 *    store de admin messages (dedup + modal urgente).
 *  - Suscribe al canal Reverb `drivers.{userId}` en paralelo para recibir en
 *    vivo cuando la app está abierta.
 *
 * Se monta una vez en el layout autenticado (`(app)/_layout.tsx`).
 */
export function useNotificationListener(): void {
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const handleAdminMessage = useAdminMessagesStore((s) => s.handleMessage);

  useAdminMessageChannel();

  useEffect(() => {
    if (!isAuthenticated) return;
    void registerForPushNotifications();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const invalidatePickups = () => {
      void qc.invalidateQueries({ queryKey: pickupOrderKeys.all });
    };

    const process = (
      data: NotificationDataShape | null | undefined,
      content: { title?: string | null; body?: string | null } | null,
    ) => {
      if (data?.type === 'pickup_assigned') {
        invalidatePickups();
        return;
      }
      const msg = extractAdminMessage(data, content?.title, content?.body);
      if (msg) handleAdminMessage(msg);
    };

    const receivedSub = Notifications.addNotificationReceivedListener((notif) => {
      const content = notif.request.content;
      process(content.data as NotificationDataShape | null, {
        title: content.title ?? null,
        body: content.body ?? null,
      });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      process(content.data as NotificationDataShape | null, {
        title: content.title ?? null,
        body: content.body ?? null,
      });
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [isAuthenticated, qc, handleAdminMessage]);
}
