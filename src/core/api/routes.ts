import { apiClient } from './client';

/**
 * Clase de domicilio del destino. Espeja `App\Domains\Shipments\Enums\DestinationAddressType`.
 *
 * Nunca es `null`: un backend anterior a la columna `address_type_code` —o una
 * fila histórica sin clasificar— cae en `'unknown'`, que es una respuesta, no
 * una ausencia. El mapa lo usa para elegir el ícono de la parada, y "no
 * sabemos" tiene que dibujarse distinto de "es una casa".
 */
export type StopAddressTypeCode = 'residential' | 'commercial' | 'store' | 'unknown';

const ADDRESS_TYPE_CODES: ReadonlySet<string> = new Set([
  'residential',
  'commercial',
  'store',
  'unknown',
]);

export type RouteStopView = {
  id: string;
  sequence: number;
  status: string;
  shipmentId: string | null;
  /** Tracking del envío: la etiqueta que el chofer lee sobre el paquete. */
  tracking: string | null;
  /**
   * `status_code` del envío.
   *
   * No es lo mismo que `status` (el de la parada): la parada la cierra la ruta,
   * el envío lo cierra la entrega, y entre un evento y el otro hay una cola de
   * sincronización offline. En el mapa manda el estado del envío cuando existe,
   * porque es el que el chofer acaba de tocar.
   */
  shipmentStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  addressLine2: string | null;
  reference: string | null;
  addressTypeCode: StopAddressTypeCode;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type DriverRouteView = {
  id: string;
  driverId: string;
  status: string;
  date: string;
  startedAt: string | null;
  finishedAt: string | null;
  stops: RouteStopView[];
};

export type OptimizeRouteResponse = {
  polyline: string;
  duration: number;
  distance: number;
};

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toTrimmedStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function toAddressTypeCode(v: unknown): StopAddressTypeCode {
  if (typeof v !== 'string') {
    return 'unknown';
  }
  const normalized = v.trim().toLowerCase();
  return ADDRESS_TYPE_CODES.has(normalized) ? (normalized as StopAddressTypeCode) : 'unknown';
}

function normalizeRouteStop(raw: unknown): RouteStopView | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') {
    return null;
  }
  const seq = toFiniteNumber(o.sequence);
  if (seq === null || !Number.isInteger(seq)) {
    return null;
  }
  const shipmentId = typeof o.shipment_id === 'string' ? o.shipment_id : null;
  const status = typeof o.status === 'string' ? o.status : '';
  let lat: number | null = null;
  let lng: number | null = null;
  let label: string | null = null;
  let addressLine2: string | null = null;
  let reference: string | null = null;
  let addressTypeCode: StopAddressTypeCode = 'unknown';
  let city: string | null = null;
  let state: string | null = null;
  let postalCode: string | null = null;
  let tracking: string | null = null;
  let shipmentStatus: string | null = null;
  const shipment = o.shipment;
  if (shipment !== null && typeof shipment === 'object') {
    const sh = shipment as Record<string, unknown>;
    tracking = toTrimmedStringOrNull(sh.tracking);
    shipmentStatus = toTrimmedStringOrNull(sh.status_code);
    const dest = sh.destination;
    if (dest !== null && typeof dest === 'object') {
      const d = dest as Record<string, unknown>;
      lat = toFiniteNumber(d.latitude);
      lng = toFiniteNumber(d.longitude);
      label = toTrimmedStringOrNull(d.address_line1);
      addressLine2 = toTrimmedStringOrNull(d.address_line2);
      reference = toTrimmedStringOrNull(d.reference);
      addressTypeCode = toAddressTypeCode(d.address_type_code);
      city = toTrimmedStringOrNull(d.city);
      state = toTrimmedStringOrNull(d.state);
      postalCode = toTrimmedStringOrNull(d.postal_code);
    }
  }
  return {
    id: o.id,
    sequence: seq,
    status,
    shipmentId,
    tracking,
    shipmentStatus,
    latitude: lat,
    longitude: lng,
    label,
    addressLine2,
    reference,
    addressTypeCode,
    city,
    state,
    postalCode,
  };
}

function parseDriverRoute(data: unknown): DriverRouteView {
  if (data === null || typeof data !== 'object') {
    throw new Error('Invalid route response');
  }
  const o = data as Record<string, unknown>;
  if (typeof o.id !== 'string') {
    throw new Error('Invalid route response');
  }
  const driverId = typeof o.driver_id === 'string' ? o.driver_id : '';
  const status = typeof o.status === 'string' ? o.status : '';
  const dateRaw = o.date;
  const date = typeof dateRaw === 'string' ? dateRaw : '';
  const startedAt = typeof o.started_at === 'string' && o.started_at.trim() !== '' ? o.started_at : null;
  const finishedAt = typeof o.finished_at === 'string' && o.finished_at.trim() !== '' ? o.finished_at : null;
  const stopsIn = Array.isArray(o.stops) ? o.stops : [];
  const stops = stopsIn.map(normalizeRouteStop).filter((s): s is RouteStopView => s !== null);
  stops.sort((a, b) => a.sequence - b.sequence);

  return {
    id: o.id,
    driverId,
    status,
    date,
    startedAt,
    finishedAt,
    stops,
  };
}

export async function fetchDriverRoute(routeId: string): Promise<DriverRouteView> {
  const { data } = await apiClient.get<unknown>(`/routes/${routeId.trim()}`);
  return parseDriverRoute(data);
}

/**
 * Driver self-service: ask the backend to (idempotently) build today's active
 * internal route from every shipment currently assigned to the driver.
 */
export async function createDriverRoute(): Promise<DriverRouteView> {
  const { data } = await apiClient.post<unknown>('/driver/routes');
  return parseDriverRoute(data);
}

export async function optimizeRoute(routeId: string): Promise<OptimizeRouteResponse> {
  const { data } = await apiClient.post<OptimizeRouteResponse>(`/routes/${routeId.trim()}/optimize`);
  return data;
}

/**
 * Marks the route as started server-side. Idempotent: calling twice keeps the
 * original started_at.
 */
export async function startDriverRoute(routeId: string): Promise<DriverRouteView> {
  const { data } = await apiClient.post<unknown>(`/driver/routes/${routeId.trim()}/start`);
  return parseDriverRoute(data);
}

/**
 * Marks the route as finished. Server returns 422 with `pending_stops` when
 * there are pending route_stops and `force` is not set.
 */
export async function finishDriverRoute(
  routeId: string,
  opts?: { force?: boolean },
): Promise<DriverRouteView> {
  const body = opts?.force === true ? { force: true } : {};
  const { data } = await apiClient.post<unknown>(`/driver/routes/${routeId.trim()}/finish`, body);
  return parseDriverRoute(data);
}
