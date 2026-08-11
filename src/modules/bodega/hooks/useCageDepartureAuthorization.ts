import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getCageDepartureStatus, type CageDepartureStatus } from '@core/api/cageDeparture';
import { createMobileEcho } from '@modules/notifications/lib/echoClient';
import { useAuthStore } from '@store/useAuthStore';

const keys = {
  status: (cageId: string, sessionId?: string) =>
    ['cage-departure', cageId, sessionId ?? null] as const,
};

/**
 * Hook para el gate de "Iniciar Recorrido": combina un fetch inicial con
 * la subscripción real-time al canal `cage.{cageId}` para desbloquear la
 * UI del chofer apenas el supervisor autorice la salida.
 */
export function useCageDepartureAuthorization(cageId: string, cageSessionId?: string): {
  data: CageDepartureStatus | undefined;
  isLoading: boolean;
  live: boolean;
} {
  const qc = useQueryClient();
  const jwt = useAuthStore((s) => s.token);
  const [live, setLive] = useState(false);

  const query = useQuery({
    queryKey: keys.status(cageId, cageSessionId),
    queryFn: () => getCageDepartureStatus(cageId, cageSessionId),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!cageId || !jwt) return;
    const echo = createMobileEcho(jwt);
    if (!echo) return;

    const channelName = `cage.${cageId}`;
    const channel = echo.private(channelName);
    channel.subscribed?.(() => setLive(true));
    channel.error?.(() => setLive(false));

    channel.listen(
      '.cage.departure-authorized',
      (_payload: { authorized_at?: string }) => {
        void qc.invalidateQueries({
          queryKey: keys.status(cageId, cageSessionId),
        });
      },
    );

    return () => {
      setLive(false);
      try {
        echo.leave(channelName);
        echo.disconnect();
      } catch {
        /* noop */
      }
    };
  }, [cageId, cageSessionId, jwt, qc]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    live,
  };
}
