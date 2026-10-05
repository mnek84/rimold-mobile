import { apiClient } from '@core/api';

import type { ReturnOrder, ReturnShipmentRef, ReturnStop } from '../types';

type RawResponse = { data?: unknown };

function toNumNullable(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNum(v: unknown): number {
  const n = toNumNullable(v);
  return n ?? 0;
}

function toShipment(raw: unknown): ReturnShipmentRef {
  const o = raw as Record<string, unknown>;
  return {
    id: String(o.id),
    tracking: String(o.tracking ?? ''),
    status_code: String(o.status_code ?? ''),
  };
}

function toStop(raw: unknown): ReturnStop {
  const o = raw as Record<string, unknown>;
  const w = o.warehouse as Record<string, unknown> | null | undefined;

  return {
    id: String(o.id),
    return_order_id: String(o.return_order_id),
    warehouse_id: String(o.warehouse_id),
    sequence: toNum(o.sequence),
    status: o.status as ReturnStop['status'],
    skip_reason: (o.skip_reason as string | null) ?? null,
    arrived_lat: toNumNullable(o.arrived_lat),
    arrived_lng: toNumNullable(o.arrived_lng),
    en_route_at: (o.en_route_at as string | null) ?? null,
    arrived_at: (o.arrived_at as string | null) ?? null,
    scanning_started_at: (o.scanning_started_at as string | null) ?? null,
    completed_at: (o.completed_at as string | null) ?? null,
    skipped_at: (o.skipped_at as string | null) ?? null,
    conforme_path: (o.conforme_path as string | null) ?? null,
    conforme_receiver_name: (o.conforme_receiver_name as string | null) ?? null,
    conforme_uploaded_at: (o.conforme_uploaded_at as string | null) ?? null,
    warehouse: w
      ? {
          id: String(w.id),
          name: String(w.name),
          address:
            (w.address as string | null) ?? (w.address_line1 as string | null) ?? null,
          business_id: (w.business_id as string | null) ?? null,
          latitude: toNumNullable(w.latitude),
          longitude: toNumNullable(w.longitude),
        }
      : null,
    shipments: Array.isArray(o.shipments) ? (o.shipments as unknown[]).map(toShipment) : [],
  };
}

function toOrder(raw: unknown): ReturnOrder {
  const o = raw as Record<string, unknown>;
  const cross = o.crossdocking_location as Record<string, unknown> | null | undefined;
  const business = o.business as Record<string, unknown> | null | undefined;

  return {
    id: String(o.id),
    business_id: (o.business_id as string | null) ?? null,
    crossdocking_location_id: String(o.crossdocking_location_id),
    driver_user_id: (o.driver_user_id as string | null) ?? null,
    status: o.status as ReturnOrder['status'],
    scheduled_date: String(o.scheduled_date),
    scheduled_time_from: (o.scheduled_time_from as string | null) ?? null,
    scheduled_time_to: (o.scheduled_time_to as string | null) ?? null,
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
    crossdocking_location: cross ? { id: String(cross.id), name: String(cross.name) } : null,
    business: business ? { id: String(business.id), name: String(business.name) } : null,
  };
}

/** Las mutaciones llevan Idempotency-Key: el chofer reintenta con mala señal. */
function idempotent(key: string) {
  return { headers: { 'Idempotency-Key': key } };
}

export async function fetchMyReturnOrders(signal?: AbortSignal): Promise<ReturnOrder[]> {
  const { data } = await apiClient.get<RawResponse>('/return-orders', { signal });
  if (data === null || typeof data !== 'object' || !Array.isArray(data.data)) return [];
  return data.data.map(toOrder);
}

export async function fetchReturnOrder(id: string, signal?: AbortSignal): Promise<ReturnOrder> {
  const { data } = await apiClient.get<unknown>(`/return-orders/${id}`, { signal });
  return toOrder(data);
}

export async function acceptReturnOrder(id: string, key: string): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(`/return-orders/${id}/accept`, {}, idempotent(key));
  return toOrder(data);
}

export async function rejectReturnOrder(
  id: string,
  reason: string,
  key: string,
): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(
    `/return-orders/${id}/reject`,
    { reason },
    idempotent(key),
  );
  return toOrder(data);
}

export async function startReturnOrder(id: string, key: string): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(`/return-orders/${id}/start`, {}, idempotent(key));
  return toOrder(data);
}

export async function completeReturnOrder(id: string, key: string): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(
    `/return-orders/${id}/complete`,
    {},
    idempotent(key),
  );
  return toOrder(data);
}

export async function arriveAtReturnStop(
  orderId: string,
  stopId: string,
  coords: { lat?: number | null; lng?: number | null } | null,
  key: string,
): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(
    `/return-orders/${orderId}/stops/${stopId}/arrive`,
    coords ?? {},
    idempotent(key),
  );
  return toOrder(data);
}

export async function startScanningReturnStop(
  orderId: string,
  stopId: string,
  key: string,
): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(
    `/return-orders/${orderId}/stops/${stopId}/start-scanning`,
    {},
    idempotent(key),
  );
  return toOrder(data);
}

/**
 * "Adjunta Conforme": la constancia de que el seller recibió.
 *
 * Va como data-URL —lo que devuelve `PhotoCaptureModal`— y no como multipart,
 * porque `CameraView::takePictureAsync` en base64 es el único camino que
 * sobrevive al APK release.
 */
export async function attachReturnStopConforme(
  orderId: string,
  stopId: string,
  input: { dataUrl: string; receiverName?: string | null },
  key: string,
): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(
    `/return-orders/${orderId}/stops/${stopId}/conforme`,
    { photo: input.dataUrl, kind: 'photo', receiver_name: input.receiverName ?? null },
    idempotent(key),
  );
  return toOrder(data);
}

export async function completeReturnStop(
  orderId: string,
  stopId: string,
  key: string,
): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(
    `/return-orders/${orderId}/stops/${stopId}/complete`,
    {},
    idempotent(key),
  );
  return toOrder(data);
}

export async function skipReturnStop(
  orderId: string,
  stopId: string,
  reason: string,
  key: string,
): Promise<ReturnOrder> {
  const { data } = await apiClient.post<unknown>(
    `/return-orders/${orderId}/stops/${stopId}/skip`,
    { reason },
    idempotent(key),
  );
  return toOrder(data);
}
