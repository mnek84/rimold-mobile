import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchDriverWorkday, type DriverWorkday } from '@core/api/workday';
import { messageForShipmentListError } from '@core/api/userFacingErrors';

/**
 * Resumen de la jornada (`GET /driver/workday`).
 *
 * `pollMs`: mientras la pantalla que lo usa está activa, se relee cada tanto.
 * Un Flex se confirma en otra app y su estado llega por webhook de Mercado
 * Libre: sin sondeo, el chofer que vuelve de Flex vería "pendiente" hasta
 * tocar actualizar. Sólo se sondea mientras haya Flex abiertos.
 */
export function useDriverWorkday(opts: { enabled?: boolean; pollMs?: number } = {}) {
  const { enabled = true, pollMs = 0 } = opts;
  const [workday, setWorkday] = useState<DriverWorkday | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async (): Promise<DriverWorkday | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setLoading(true);
    try {
      const w = await fetchDriverWorkday();
      setWorkday(w);
      setError(null);
      return w;
    } catch (e) {
      setError(messageForShipmentListError(e));
      return null;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const flexOpen = (workday?.flex.pending ?? 0) > 0;
  useEffect(() => {
    if (!enabled || pollMs <= 0 || !flexOpen) return undefined;
    const t = setInterval(() => void reload(), pollMs);
    return () => clearInterval(t);
  }, [enabled, pollMs, flexOpen, reload]);

  return { workday, setWorkday, loading, error, reload };
}
