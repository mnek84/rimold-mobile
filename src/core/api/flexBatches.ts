import { apiClient } from './client';

export type FlexShipmentView = {
  id: string;
  tracking: string;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
};

export type FlexBatchView = {
  id: string;
  driverId: string | null;
  status: string;
  shipments: FlexShipmentView[];
};

export type FlexRouteSuggestion = {
  polyline: string;
  optimized_order: string[];
  waypoint_order: number[];
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

function normalizeShipment(raw: unknown): FlexShipmentView | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') {
    return null;
  }
  const tracking = typeof o.tracking === 'string' ? o.tracking : '';
  let lat: number | null = null;
  let lng: number | null = null;
  let label: string | null = null;
  const dest = o.destination;
  if (dest !== null && typeof dest === 'object') {
    const d = dest as Record<string, unknown>;
    lat = toFiniteNumber(d.latitude);
    lng = toFiniteNumber(d.longitude);
    label = typeof d.address_line1 === 'string' ? d.address_line1 : null;
  }
  return { id: o.id, tracking, latitude: lat, longitude: lng, label };
}

export async function fetchFlexBatch(batchId: string): Promise<FlexBatchView> {
  const { data } = await apiClient.get<unknown>(`/flex-batches/${batchId.trim()}`);
  if (data === null || typeof data !== 'object') {
    throw new Error('Invalid flex batch response');
  }
  const o = data as Record<string, unknown>;
  if (typeof o.id !== 'string') {
    throw new Error('Invalid flex batch response');
  }
  const driverId = typeof o.driver_id === 'string' ? o.driver_id : null;
  const status = typeof o.status === 'string' ? o.status : '';
  const shipmentsIn = Array.isArray(o.shipments) ? o.shipments : [];
  const shipments = shipmentsIn.map(normalizeShipment).filter((s): s is FlexShipmentView => s !== null);

  return { id: o.id, driverId, status, shipments };
}

export async function suggestFlexRoute(batchId: string): Promise<FlexRouteSuggestion> {
  const { data } = await apiClient.post<FlexRouteSuggestion>(
    `/flex-batches/${batchId.trim()}/suggest-route`,
  );
  return data;
}
