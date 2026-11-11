/**
 * True when both values are finite numbers suitable for react-native-maps.
 *
 * (0,0) se rechaza: es el "no sé" de muchos clientes de mapas y de algunos
 * payloads de Mercado Libre, no un punto real (está en el Golfo de Guinea). El
 * backend aplica la misma regla en `CoordinateValidator`; además valida el área
 * de servicio y ejes invertidos, que la app recibe ya resueltos.
 */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(Math.abs(lat) < 1e-9 && Math.abs(lng) < 1e-9)
  );
}

export function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
