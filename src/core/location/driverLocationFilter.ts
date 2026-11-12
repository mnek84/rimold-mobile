/**
 * Qué fixes GPS vale la pena encolar y enviar.
 *
 * En primer plano llegan dos fuentes a la vez (la tarea de fondo y el
 * `watchPositionAsync`), así que el mismo fix entraba dos veces a la cola y se
 * mandaba dos veces. Y con el chofer detenido (descargando, en un semáforo
 * largo) el GPS sigue entregando puntos que difieren en el ruido: un POST cada
 * 5 s para decir "sigo acá".
 *
 * Regla (adaptativa al movimiento, sin reiniciar el servicio de ubicación):
 *  - mismo instante o más viejo que el último guardado → descartar (duplicado
 *    de la otra fuente, o fuera de orden);
 *  - precisión peor que {@link MAX_ACCURACY_M} → descartar (salto de antena);
 *  - en movimiento (se movió ≥ {@link MIN_MOVE_M} o va a ≥ {@link MOVING_SPEED_MS})
 *    → guardar: el SO ya limita a 5 s / 10 m;
 *  - detenido → guardar sólo un latido cada {@link STATIONARY_HEARTBEAT_MS},
 *    para que el panel sepa que hay señal.
 *
 * El instante del fix (`timestamp` del GPS) se conserva siempre: el backend lo
 * usa para descartar posiciones viejas o fuera de orden.
 */

export const MIN_MOVE_M = 15;
export const MOVING_SPEED_MS = 1.5; // ~5 km/h
export const STATIONARY_HEARTBEAT_MS = 60_000;
export const MAX_ACCURACY_M = 150;

export type FixSample = {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number;
  accuracy?: number;
};

export type FilterDecision = { keep: boolean; reason: 'first' | 'moving' | 'heartbeat' | 'duplicate' | 'out_of_order' | 'inaccurate' | 'stationary' };

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function shouldKeepFix(prev: FixSample | null, next: FixSample): FilterDecision {
  if (next.accuracy != null && next.accuracy > MAX_ACCURACY_M) {
    return { keep: false, reason: 'inaccurate' };
  }
  if (prev === null) {
    return { keep: true, reason: 'first' };
  }
  if (next.timestamp === prev.timestamp) {
    return { keep: false, reason: 'duplicate' };
  }
  if (next.timestamp < prev.timestamp) {
    return { keep: false, reason: 'out_of_order' };
  }
  const moved = distanceMeters(prev, next);
  if (moved >= MIN_MOVE_M || (next.speed != null && next.speed >= MOVING_SPEED_MS)) {
    return { keep: true, reason: 'moving' };
  }
  if (next.timestamp - prev.timestamp >= STATIONARY_HEARTBEAT_MS) {
    return { keep: true, reason: 'heartbeat' };
  }
  return { keep: false, reason: 'stationary' };
}
