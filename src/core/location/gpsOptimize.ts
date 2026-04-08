const EARTH_RADIUS_M = 6_371_000;

/** ~11 m latitude resolution; reduces payload vs 6 decimals. */
export const GPS_COORD_DECIMALS = 4;

export type GpsWirePoint = {
  lat: number;
  lng: number;
  /** Unix time ms */
  t: number;
};

export function roundCoord(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function toWirePoint(lat: number, lng: number, timestampMs: number): GpsWirePoint {
  return {
    lat: roundCoord(lat, GPS_COORD_DECIMALS),
    lng: roundCoord(lng, GPS_COORD_DECIMALS),
    t: Math.round(timestampMs),
  };
}

/** Great-circle distance in meters (WGS84 sphere). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Skip points that are redundant after rounding or barely moved vs the last kept fix.
 */
export function shouldKeepWirePoint(
  lastKept: GpsWirePoint | null,
  candidate: GpsWirePoint,
  minMovementMeters: number,
): boolean {
  if (lastKept == null) {
    return true;
  }
  if (candidate.lat === lastKept.lat && candidate.lng === lastKept.lng) {
    return false;
  }
  const d = haversineMeters(lastKept.lat, lastKept.lng, candidate.lat, candidate.lng);
  return d >= minMovementMeters;
}
