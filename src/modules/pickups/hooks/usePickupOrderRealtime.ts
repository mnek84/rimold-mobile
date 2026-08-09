import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { createMobileEcho } from '@modules/notifications/lib/echoClient';
import { useAuthStore } from '@store/useAuthStore';

import { pickupOrderKeys } from './usePickupOrders';

/**
 * Suscribe al canal privado `pickup-orders.{orderId}` mientras el hook esté
 * montado. Cuando llega un evento de cambio (`PickupOrderStatusChanged`,
 * `PickupStopStatusChanged`, `PickupOrderAssigned`, etc.), invalida las
 * queries del listado y del detalle para refrescar la UI sin esperar polling.
 *
 * Degrada silencioso si el bundle no incluye laravel-echo/pusher-js o si las
 * envs de Reverb no están seteadas — la app sigue funcionando con polling.
 */
export function usePickupOrderRealtime(orderId: string | undefined): void {
  const qc = useQueryClient();
  const jwt = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!orderId || !jwt) {
      console.log('[realtime] skip — orderId o jwt ausentes', {
        orderId: orderId ?? '(missing)',
        jwtPresent: Boolean(jwt),
      });
      return;
    }

    const echo = createMobileEcho(jwt);
    if (!echo) {
      console.warn('[realtime] createMobileEcho devolvió null — no hay realtime, la app degrada a polling.');
      return;
    }

    const channelName = `pickup-orders.${orderId}`;
    console.log('[realtime] suscribiendo a canal privado', channelName);

    const invalidate = (eventName: string) => (payload: unknown) => {
      console.log('[realtime] evento recibido', eventName, payload);
      void qc.invalidateQueries({ queryKey: pickupOrderKeys.detail(orderId) });
      void qc.invalidateQueries({ queryKey: pickupOrderKeys.list() });
    };

    const channel = echo.private(channelName);

    // Callbacks del ciclo de vida de la subscripción — nos dice si el auth
    // contra /broadcasting/auth pasó o falló (típico: 401/403 → error acá).
    channel.subscribed?.(() => {
      console.log('[realtime] canal SUSCRIPTO', channelName);
    });
    channel.error?.((err: unknown) => {
      console.warn('[realtime] error suscribiendo a', channelName, err);
    });

    channel.listen('.PickupOrderStatusChanged', invalidate('PickupOrderStatusChanged'));
    channel.listen('.PickupOrderAssigned', invalidate('PickupOrderAssigned'));
    channel.listen('.PickupOrderReassigned', invalidate('PickupOrderReassigned'));
    channel.listen('.PickupStopStatusChanged', invalidate('PickupStopStatusChanged'));

    return () => {
      console.log('[realtime] cleanup — dejando canal', channelName);
      try {
        echo.leave(channelName);
        echo.disconnect();
      } catch (err) {
        console.warn('[realtime] error en tear-down', err);
      }
    };
  }, [orderId, jwt, qc]);
}
