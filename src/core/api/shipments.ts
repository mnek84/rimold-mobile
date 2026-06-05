import axios from 'axios';

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
  /** Salidas a reparto (intentos de visita). */
  delivery_visit_count: number;
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
  const visitRaw = r.delivery_visit_count;
  const delivery_visit_count =
    typeof visitRaw === 'number' && Number.isFinite(visitRaw)
      ? Math.max(0, Math.floor(visitRaw))
      : 0;

  return {
    id: r.id,
    tracking_id: r.tracking_id,
    address: typeof r.address === 'string' ? r.address : '',
    status: typeof r.status === 'string' ? r.status : '',
    execution_type: typeof r.execution_type === 'string' ? r.execution_type : 'internal',
    route_id: typeof routeRaw === 'string' ? routeRaw : null,
    flex_batch_id: typeof flexRaw === 'string' ? flexRaw : null,
    delivery_visit_count,
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
  reassigned: boolean;
};

/** Structured reasons emitted by the backend on a 4xx scan attempt. */
export type AssignScanReason =
  | 'not_found'
  | 'requires_confirmation'
  | 'not_collected_yet'
  | 'flex_not_supported'
  | 'already_delivered'
  | 'already_failed'
  | 'already_returned'
  | 'already_cancelled';

export type AssignScanCurrentDriver = {
  id: string;
  name: string | null;
};

/** Typed error thrown by {@link assignShipmentByTracking} for known 4xx outcomes. */
export class AssignScanError extends Error {
  readonly status: number;

  readonly reason: AssignScanReason | string;

  readonly currentStatus: string | null;

  readonly currentDriver: AssignScanCurrentDriver | null;

  /**
   * Backend-resolved shipment UUID (only populated for reasons where the
   * shipment was identified, e.g. `flex_not_supported`). Lets the mobile
   * pivot a rejected scan into the report-failure flow without an extra
   * lookup round-trip.
   */
  readonly shipmentId: string | null;

  /** Canonical tracking returned by the server for the scanned shipment. */
  readonly trackingId: string | null;

  constructor(params: {
    status: number;
    reason: AssignScanReason | string;
    message: string;
    currentStatus?: string | null;
    currentDriver?: AssignScanCurrentDriver | null;
    shipmentId?: string | null;
    trackingId?: string | null;
  }) {
    super(params.message);
    this.name = 'AssignScanError';
    this.status = params.status;
    this.reason = params.reason;
    this.currentStatus = params.currentStatus ?? null;
    this.currentDriver = params.currentDriver ?? null;
    this.shipmentId = params.shipmentId ?? null;
    this.trackingId = params.trackingId ?? null;
  }
}

export type AssignShipmentByTrackingArgs = {
  trackingId: string;
  forceReassign?: boolean;
};

function parseAssignScanError(error: unknown): AssignScanError | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }
  const status = error.response?.status;
  if (typeof status !== 'number' || status < 400 || status >= 500) {
    return null;
  }
  const body = error.response?.data;
  const obj = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const reason = typeof obj.reason === 'string' ? obj.reason : null;
  if (reason === null) {
    return null;
  }

  const currentStatus = typeof obj.current_status === 'string' ? obj.current_status : null;

  let currentDriver: AssignScanCurrentDriver | null = null;
  const driverRaw = obj.current_driver;
  if (driverRaw !== null && typeof driverRaw === 'object') {
    const d = driverRaw as Record<string, unknown>;
    if (typeof d.id === 'string') {
      currentDriver = {
        id: d.id,
        name: typeof d.name === 'string' ? d.name : null,
      };
    }
  }

  const message = typeof obj.message === 'string' && obj.message.length > 0 ? obj.message : reason;

  const shipmentId = typeof obj.shipment_id === 'string' && obj.shipment_id !== '' ? obj.shipment_id : null;
  const trackingId = typeof obj.tracking_id === 'string' && obj.tracking_id !== '' ? obj.tracking_id : null;

  return new AssignScanError({
    status,
    reason,
    message,
    currentStatus,
    currentDriver,
    shipmentId,
    trackingId,
  });
}

export async function assignShipmentByTracking(
  args: AssignShipmentByTrackingArgs | string,
): Promise<AssignShipmentResponse> {
  const trackingId = typeof args === 'string' ? args : args.trackingId;
  const forceReassign = typeof args === 'string' ? false : args.forceReassign === true;

  try {
    const { data } = await apiClient.post<AssignShipmentResponse>('/shipments/assign', {
      tracking_id: trackingId.trim(),
      force_reassign: forceReassign,
    });
    return data;
  } catch (e) {
    const scanError = parseAssignScanError(e);
    if (scanError !== null) {
      throw scanError;
    }
    throw e;
  }
}

/**
 * Read-only metadata for a shipment scanned via QR / barcode / tracking input.
 * Returned by `POST /shipments/lookup`. Used by the mobile "report failure by
 * scan" flow to drive the existing DeliveryFailedModal without claiming the
 * shipment for the driver.
 */
export type ShipmentScanLookupResponse = {
  id: string;
  tracking_id: string;
  status: string;
  execution_type: string;
  business_id: string;
  driver_id: string | null;
};

function normalizeShipmentScanLookupResponse(raw: unknown): ShipmentScanLookupResponse | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') {
    return null;
  }
  return {
    id: r.id,
    tracking_id: typeof r.tracking_id === 'string' ? r.tracking_id : '',
    status: typeof r.status === 'string' ? r.status : '',
    execution_type: typeof r.execution_type === 'string' ? r.execution_type : 'internal',
    business_id: typeof r.business_id === 'string' ? r.business_id : '',
    driver_id: typeof r.driver_id === 'string' && r.driver_id !== '' ? r.driver_id : null,
  };
}

/**
 * Look up shipment metadata for the scan-and-report-failure flow.
 *
 * Throws an {@link AssignScanError} for known 4xx rejection reasons (notably
 * `not_found` and `already_<status>`), so call sites can reuse the same error
 * handling shape as {@link assignShipmentByTracking}.
 */
export async function lookupShipmentByScan(raw: string): Promise<ShipmentScanLookupResponse> {
  try {
    const { data } = await apiClient.post<unknown>('/shipments/lookup', {
      raw: raw.trim(),
    });
    const normalized = normalizeShipmentScanLookupResponse(data);
    if (normalized === null) {
      throw new Error('La respuesta de búsqueda de envío fue inválida.');
    }
    return normalized;
  } catch (e) {
    const scanError = parseAssignScanError(e);
    if (scanError !== null) {
      throw scanError;
    }
    throw e;
  }
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
  delivery_visit_count?: number | null;
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
