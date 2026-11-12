import { useEffect } from 'react';

import { hasRole } from '@core/auth/types';
import { notifyDriverDayChanged } from '@core/sync';
import { createMobileEcho } from '@modules/notifications/lib/echoClient';
import { useAuthStore } from '@store/useAuthStore';

/**
 * Tiempo real de la jornada del chofer: canal privado
 * `driver-workload.{driverId}` (el usuario del chofer comparte id con el chofer).
 *
 * El backend publica ahí el mismo evento que recibe Dispatch / Live
 * (`DriverDayProgressUpdated`) cada vez que cambia un envío del chofer: una
 * entrega propia, un webhook de Mercado Libre que cierra un Flex, una
 * asignación o reasignación desde el panel. Al llegar, Entregas y Paradas
 * vuelven a pedir su vista al servidor (vía `notifyDriverDayChanged`): el
 * evento dice QUE cambió, el servidor sigue siendo quien dice CÓMO quedó.
 *
 * Sin Reverb configurado (o sin los paquetes en el bundle) no hace nada: las
 * pantallas siguen con el refresco al enfocar y el sondeo mientras hay Flex
 * abiertos.
 */
export function useDriverWorkloadRealtime(): void {
  const jwt = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const isDriver = hasRole(user, 'DRIVER');

  useEffect(() => {
    if (!jwt || !userId || !isDriver) return;

    const echo = createMobileEcho(jwt);
    if (!echo) return;

    const channelName = `driver-workload.${userId}`;
    const channel = echo.private(channelName);

    channel.error?.((err: unknown) => {
      console.warn('[realtime] error suscribiendo a', channelName, err);
    });
    channel.listen('.DriverDayProgressUpdated', () => {
      notifyDriverDayChanged();
    });

    return () => {
      try {
        echo.leave(channelName);
        echo.disconnect();
      } catch (err) {
        console.warn('[realtime] error en tear-down', channelName, err);
      }
    };
  }, [jwt, userId, isDriver]);
}
