import polyline from '@mapbox/polyline';

/**
 * Decodes an OSRM / Google encoded polyline (precision 5) to react-native-maps coordinates.
 */
export function decodeOsrmPolyline(encoded: string): { latitude: number; longitude: number }[] {
  if (encoded.length === 0) {
    return [];
  }
  const pairs = polyline.decode(encoded, 5) as [number, number][];
  return pairs
    .map(([latitude, longitude]) => ({ latitude, longitude }))
    .filter(
      (c) =>
        Number.isFinite(c.latitude) &&
        Number.isFinite(c.longitude) &&
        c.latitude >= -90 &&
        c.latitude <= 90 &&
        c.longitude >= -180 &&
        c.longitude <= 180,
    );
}
