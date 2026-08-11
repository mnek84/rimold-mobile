import { useEffect } from 'react';

import { createMobileEcho } from '@modules/notifications/lib/echoClient';
import { useAdminMessagesStore, type AdminMessage } from '@modules/notifications/state/adminMessagesStore';
import { useAuthStore } from '@store/useAuthStore';

type BroadcastPayload = {
  id?: string;
  type?: string;
  title?: string;
  body?: string;
  sent_at?: string | null;
};

/**
 * Suscribe al canal privado `drivers.{userId}` para recibir en vivo mensajes
 * admin cuando la app está abierta. Complementa al push de Expo: si el push
 * llega primero, la store dedup evita mostrar el mensaje dos veces.
 *
 * Degrada silencioso si Reverb no está disponible.
 */
export function useAdminMessageChannel(): void {
  const jwt = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id);
  const handleMessage = useAdminMessagesStore((s) => s.handleMessage);

  useEffect(() => {
    if (!jwt || !userId) return;

    const echo = createMobileEcho(jwt);
    if (!echo) return;

    const channelName = `drivers.${userId}`;
    const channel = echo.private(channelName);

    channel.subscribed?.(() => {
      console.log('[realtime] canal admin SUSCRIPTO', channelName);
    });
    channel.error?.((err: unknown) => {
      console.warn('[realtime] error suscribiendo a', channelName, err);
    });

    channel.listen('.DriverAdminMessage', (payload: BroadcastPayload) => {
      if (!payload?.id || !payload?.type || !payload?.title || !payload?.body) return;
      const msg: AdminMessage = {
        id: payload.id,
        type: payload.type as AdminMessage['type'],
        title: payload.title,
        body: payload.body,
        sentAt: payload.sent_at ?? null,
      };
      handleMessage(msg);
    });

    return () => {
      try {
        echo.leave(channelName);
        echo.disconnect();
      } catch (err) {
        console.warn('[realtime] error en tear-down canal admin', err);
      }
    };
  }, [jwt, userId, handleMessage]);
}
