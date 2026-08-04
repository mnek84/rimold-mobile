import { apiClient } from './client';

export type RouteStopView = {
  id: string;
  sequence: number;
  status: string;
  shipmentId: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
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
  let city: string | null = null;
  let state: string | null = null;
  let postalCode: string | null = null;
  const shipment = o.shipment;
  if (shipment !== null && typeof shipment === 'object') {
    const dest = (shipment as Record<string, unknown>).destination;
    if (dest !== null && typeof dest === 'object') {
      const d = dest as Record<string, unknown>;
      lat = toFiniteNumber(d.latitude);
      lng = toFiniteNumber(d.longitude);
      label = typeof d.address_line1 === 'string' ? d.address_line1 : null;
      city = typeof d.city === 'string' && d.city.trim() !== '' ? d.city : null;
      state = typeof d.state === 'string' && d.state.trim() !== '' ? d.state : null;
      postalCode =
        typeof d.postal_code === 'string' && d.postal_code.trim() !== '' ? d.postal_code : null;
    }
  }
  return {
    id: o.id,
    sequence: seq,
    status,
    shipmentId,
    latitude: lat,
    longitude: lng,
    label,
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
