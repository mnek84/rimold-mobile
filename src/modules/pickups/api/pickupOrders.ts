import { apiClient } from '@core/api';

import type {
  IncidentKind,
  IncidentPhase,
  PickupIncident,
  PickupOrder,
  PickupStop,
} from '../types';

type RawResponse = { data?: unknown };

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNumNullable(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStop(raw: unknown): PickupStop {
  const o = raw as Record<string, unknown>;
  return {
    id: String(o.id),
    pickup_order_id: String(o.pickup_order_id),
    warehouse_id: String(o.warehouse_id),
    sequence: toNum(o.sequence),
    status: o.status as PickupStop['status'],
    collection_id: (o.collection_id as string | null) ?? null,
    skip_reason: (o.skip_reason as string | null) ?? null,
    arrived_lat: toNumNullable(o.arrived_lat),
    arrived_lng: toNumNullable(o.arrived_lng),
    en_route_at: (o.en_route_at as string | null) ?? null,
    arrived_at: (o.arrived_at as string | null) ?? null,
    scanning_started_at: (o.scanning_started_at as string | null) ?? null,
    completed_at: (o.completed_at as string | null) ?? null,
    skipped_at: (o.skipped_at as string | null) ?? null,
    warehouse: o.warehouse
      ? {
          id: String((o.warehouse as Record<string, unknown>).id),
          name: String((o.warehouse as Record<string, unknown>).name),
          address:
            ((o.warehouse as Record<string, unknown>).address as string | null) ?? null,
          business_id:
            ((o.warehouse as Record<string, unknown>).business_id as string | null) ?? null,
          latitude: toNumNullable((o.warehouse as Record<string, unknown>).latitude),
          longitude: toNumNullable((o.warehouse as Record<string, unknown>).longitude),
        }
      : null,
  };
}

function toOrder(raw: unknown): PickupOrder {
  const o = raw as Record<string, unknown>;
  return {
    id: String(o.id),
    business_id: (o.business_id as string | null) ?? null,
    crossdocking_location_id: String(o.crossdocking_location_id),
    driver_user_id: String(o.driver_user_id),
    status: o.status as PickupOrder['status'],
    scheduled_date: String(o.scheduled_date),
    scheduled_time_from: (o.scheduled_time_from as string | null) ?? null,
    scheduled_time_to: (o.scheduled_time_to as string | null) ?? null,
    driver_name_snapshot: (o.driver_name_snapshot as string | null) ?? null,
    driver_phone_snapshot: (o.driver_phone_snapshot as string | null) ?? null,
    reject_reason: (o.reject_reason as string | null) ?? null,
    cancel_reason: (o.cancel_reason as string | null) ?? null,
    notes: (o.notes as string | null) ?? null,
    accepted_at: (o.accepted_at as string | null) ?? null,
    rejected_at: (o.rejected_at as string | null) ?? null,
    started_at: (o.started_at as string | null) ?? null,
    returning_at: (o.returning_at as string | null) ?? null,
    completed_at: (o.completed_at as string | null) ?? null,
    cancelled_at: (o.cancelled_at as string | null) ?? null,
    stops: Array.isArray(o.stops) ? (o.stops as unknown[]).map(toStop) : [],
    crossdocking_location: o.crossdocking_location
      ? {
          id: String((o.crossdocking_location as Record<string, unknown>).id),
          name: String((o.crossdocking_location as Record<string, unknown>).name),
        }
      : null,
    business: o.business
      ? {
          id: String((o.business as Record<string, unknown>).id),
          name: String((o.business as Record<string, unknown>).name),
        }
      : null,
  };
}

export async function fetchMyPickupOrders(signal?: AbortSignal): Promise<PickupOrder[]> {
  const { data } = await apiClient.get<RawResponse>('/pickup-orders', { signal });
  if (data === null || typeof data !== 'object' || !Array.isArray(data.data)) return [];
  return data.data.map(toOrder);
}

export async function fetchPickupOrder(id: string, signal?: AbortSignal): Promise<PickupOrder> {
  const { data } = await apiClient.get<unknown>(`/pickup-orders/${id}`, { signal });
  return toOrder(data);
}

export async function acceptPickupOrder(id: string, idempotencyKey: string): Promise<PickupOrder> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${id}/accept`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return toOrder(data);
}

export async function rejectPickupOrder(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<PickupOrder> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${id}/reject`,
    { reason },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return toOrder(data);
}

export async function startPickupOrder(id: string, idempotencyKey: string): Promise<PickupOrder> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${id}/start`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return toOrder(data);
}

export async function completePickupOrder(
  id: string,
  coords: { lat?: number | null; lng?: number | null } | null,
  idempotencyKey: string,
): Promise<PickupOrder> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${id}/complete`,
    coords ?? {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return toOrder(data);
}

export async function arriveAtStop(
  orderId: string,
  stopId: string,
  coords: { lat?: number | null; lng?: number | null } | null,
  idempotencyKey: string,
): Promise<PickupStop> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${orderId}/stops/${stopId}/arrive`,
    coords ?? {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return toStop(data);
}

export async function startScanningStop(
  orderId: string,
  stopId: string,
  idempotencyKey: string,
): Promise<PickupStop> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${orderId}/stops/${stopId}/start-scanning`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return toStop(data);
}

export async function completeStop(
  orderId: string,
  stopId: string,
  idempotencyKey: string,
): Promise<PickupOrder> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${orderId}/stops/${stopId}/complete`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return toOrder(data);
}

export async function skipStop(
  orderId: string,
  stopId: string,
  reason: string,
  idempotencyKey: string,
): Promise<PickupOrder> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${orderId}/stops/${stopId}/skip`,
    { reason },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return toOrder(data);
}

export async function reportPickupIncident(
  orderId: string,
  payload: {
    phase: IncidentPhase;
    kind: IncidentKind;
    description: string;
    pickupStopId?: string | null;
  },
  idempotencyKey: string,
): Promise<PickupIncident> {
  const { data } = await apiClient.post<unknown>(
    `/pickup-orders/${orderId}/incidents`,
    {
      phase: payload.phase,
      kind: payload.kind,
      description: payload.description,
      pickup_stop_id: payload.pickupStopId ?? null,
    },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  const o = data as Record<string, unknown>;
  return {
    id: String(o.id),
    pickup_order_id: String(o.pickup_order_id),
    pickup_stop_id: (o.pickup_stop_id as string | null) ?? null,
    phase: o.phase as IncidentPhase,
    kind: o.kind as IncidentKind,
    description: String(o.description ?? ''),
    reported_at: String(o.reported_at ?? ''),
    resolution: (o.resolution as PickupIncident['resolution']) ?? null,
    resolved_at: (o.resolved_at as string | null) ?? null,
  };
}
