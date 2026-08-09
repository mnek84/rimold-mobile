import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { pickupOrderKeys } from '@modules/pickups/hooks/usePickupOrders';
import { useAuthStore } from '@store/useAuthStore';

import { registerForPushNotifications } from '../lib/registerForPushNotifications';

/**
 * Escucha notificaciones push mientras el usuario está autenticado:
 *  - Registra el ExpoPushToken en el backend al primer mount autenticado.
 *  - Cuando llega un push con `data.type === 'pickup_assigned'`, invalida las
 *    queries de pickup orders para refrescar el listado sin esperar al polling.
 *  - Escucha `NotificationResponse` (tap desde el tray) para el mismo trigger.
 *
 * Se monta una vez en el layout autenticado (`(app)/_layout.tsx`).
 */
export function useNotificationListener(): void {
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    void registerForPushNotifications();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const invalidatePickups = () => {
      void qc.invalidateQueries({ queryKey: pickupOrderKeys.all });
    };

    const receivedSub = Notifications.addNotificationReceivedListener((notif) => {
      const type = (notif.request.content.data as { type?: string } | null)?.type;
      if (type === 'pickup_assigned') invalidatePickups();
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = (response.notification.request.content.data as { type?: string } | null)
        ?.type;
      if (type === 'pickup_assigned') invalidatePickups();
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [isAuthenticated, qc]);
}
