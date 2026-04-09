import { isValidLatLng, toFiniteNumber } from '@core/geo/coordinates';

import { apiClient } from './client';

export type TodayShipmentRow = {
  id: string;
  tracking_id: string;
  address: string;
  status: string;
  execution_type: string;
  route_id: string | null;
  flex_batch_id: string | null;
};

function normalizeTodayShipmentRow(raw: unknown): TodayShipmentRow | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.tracking_id !== 'string') {
    return null;
  }
  const routeRaw = r.route_id;
  const flexRaw = r.flex_batch_id;
  return {
    id: r.id,
    tracking_id: r.tracking_id,
    address: typeof r.address === 'string' ? r.address : '',
    status: typeof r.status === 'string' ? r.status : '',
    execution_type: typeof r.execution_type === 'string' ? r.execution_type : 'internal',
    route_id: typeof routeRaw === 'string' ? routeRaw : null,
    flex_batch_id: typeof flexRaw === 'string' ? flexRaw : null,
  };
}

export async function fetchShipmentsToday(): Promise<TodayShipmentRow[]> {
  const { data } = await apiClient.get<unknown>('/shipments/today');
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(normalizeTodayShipmentRow).filter((row): row is TodayShipmentRow => row !== null);
}

export type AssignShipmentResponse = {
  id: string;
  tracking_id: string;
  status: string;
  already_assigned: boolean;
};

export async function assignShipmentByTracking(trackingId: string): Promise<AssignShipmentResponse> {
  const { data } = await apiClient.post<AssignShipmentResponse>('/shipments/assign', {
    tracking_id: trackingId.trim(),
  });
  return data;
}

export type ShipmentNavigationStop = {
  sequence: number;
  shipment_id: string;
  latitude: number;
  longitude: number;
  label?: string | null;
  status: string;
  is_next: boolean;
};

export type ShipmentNavigationResponse = {
  destination: { latitude: number; longitude: number; label?: string | null } | null;
  encoded_polyline: string | null;
  stops: ShipmentNavigationStop[];
  next_shipment_id: string | null;
  route_id: string | null;
};

function normalizeShipmentNavigationResponse(raw: unknown): ShipmentNavigationResponse {
  const o = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const destRaw = o.destination;
  let destination: ShipmentNavigationResponse['destination'] = null;
  if (destRaw !== null && typeof destRaw === 'object') {
    const d = destRaw as Record<string, unknown>;
    const lat = toFiniteNumber(d.latitude);
    const lng = toFiniteNumber(d.longitude);
    if (lat !== null && lng !== null && isValidLatLng(lat, lng)) {
      destination = {
        latitude: lat,
        longitude: lng,
        label: typeof d.label === 'string' ? d.label : d.label === null ? null : undefined,
      };
    }
  }

  const poly = o.encoded_polyline;
  const encoded_polyline =
    typeof poly === 'string' && poly.length > 0 ? poly : null;

  const stopsIn = Array.isArray(o.stops) ? o.stops : [];
  const stops: ShipmentNavigationStop[] = [];
  for (const item of stopsIn) {
    if (item === null || typeof item !== 'object') {
      continue;
    }
    const s = item as Record<string, unknown>;
    const lat = toFiniteNumber(s.latitude);
    const lng = toFiniteNumber(s.longitude);
    if (lat === null || lng === null || !isValidLatLng(lat, lng)) {
      continue;
    }
    if (typeof s.shipment_id !== 'string') {
      continue;
    }
    const seq = toFiniteNumber(s.sequence);
    if (seq === null || !Number.isInteger(seq)) {
      continue;
    }
    stops.push({
      sequence: seq,
      shipment_id: s.shipment_id,
      latitude: lat,
      longitude: lng,
      label: typeof s.label === 'string' ? s.label : s.label === null ? null : undefined,
      status: typeof s.status === 'string' ? s.status : '',
      is_next: s.is_next === true,
    });
  }

  const nextRaw = o.next_shipment_id;
  const next_shipment_id = typeof nextRaw === 'string' ? nextRaw : null;

  const routeRaw = o.route_id;
  const route_id = typeof routeRaw === 'string' ? routeRaw : null;

  return {
    destination,
    encoded_polyline,
    stops,
    next_shipment_id,
    route_id,
  };
}

export async function fetchShipmentNavigation(shipmentId: string): Promise<ShipmentNavigationResponse> {
  const { data } = await apiClient.get<unknown>(`/shipments/${shipmentId.trim()}/navigation`);
  return normalizeShipmentNavigationResponse(data);
}

/** JSON shape from GET /shipments/{id} (Laravel Shipment + destination). */
export type ShipmentDestinationJson = {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};

export type ShipmentDetailJson = {
  id: string;
  tracking?: string | null;
  status_code?: string | null;
  destination?: ShipmentDestinationJson | null;
};

export function formatShipmentAddress(destination: ShipmentDestinationJson | null | undefined): string {
  if (destination == null) {
    return '';
  }
  const lines = [destination.address_line1, destination.address_line2].filter(
    (x): x is string => typeof x === 'string' && x.trim() !== '',
  );
  const locality = [destination.city, destination.state, destination.postal_code]
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .join(', ');
  const tail = [locality, destination.country_code].filter(
    (x): x is string => typeof x === 'string' && x.trim() !== '',
  );
  const parts = [...lines, ...tail];
  return parts.join(' · ');
}

export async function fetchShipment(shipmentId: string): Promise<ShipmentDetailJson> {
  const { data } = await apiClient.get<ShipmentDetailJson>(`/shipments/${shipmentId.trim()}`);
  return data;
}
