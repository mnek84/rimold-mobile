import { isValidLatLng } from './coordinates';

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two WGS84 points (Haversine). Returns `null` if any argument is missing or invalid.
 */
export function calculateDistance(
  lat1: unknown,
  lng1: unknown,
  lat2: unknown,
  lng2: unknown,
): number | null {
  if (!isValidLatLng(lat1, lng1) || !isValidLatLng(lat2, lng2)) {
    return null;
  }

  const a1 = lat1 as number;
  const o1 = lng1 as number;
  const a2 = lat2 as number;
  const o2 = lng2 as number;

  const φ1 = toRadians(a1);
  const φ2 = toRadians(a2);
  const Δφ = toRadians(a2 - a1);
  const Δλ = toRadians(o2 - o1);

  const sinΔφ2 = Math.sin(Δφ / 2);
  const sinΔλ2 = Math.sin(Δλ / 2);
  const a = sinΔφ2 * sinΔφ2 + Math.cos(φ1) * Math.cos(φ2) * sinΔλ2 * sinΔλ2;
  const aClamped = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped));

  return EARTH_RADIUS_KM * c;
}
