import { apiClient, idempotencyHeaders, resolveExternalQR } from '@core/api';
import { normalizeShipmentScanToLookupKey } from '@core/scanner/normalizeShipmentScan';

import type { QueueEvent } from './eventQueue';
import { EventType } from './eventTypes';

async function normalizeCollectionItem(entry: string): Promise<string> {
  const trimmed = entry.trim();
  if (trimmed.startsWith('TRK_')) {
    return trimmed;
  }
  const candidate = normalizeShipmentScanToLookupKey(trimmed);
  try {
    const { tracking_id } = await resolveExternalQR(candidate);
    const id = tracking_id.trim();
    if (id !== '') return id;
  } catch {
    // keep candidate (e.g. sin red o código aún no resoluble)
  }
  return candidate;
}

type CollectionPayload = {
  collectionId: string;
  items?: string[];
  trackingId?: string;
  raw?: string;
  businessId?: string;
  warehouseId?: string;
  businessName?: string;
  warehouseName?: string;
  driverUserId?: string;
  driverName?: string;
};

/** PNG signature: data URL for Laravel POD / S3. */
function normalizeSignaturePayload(raw: string): string {
  if (raw.startsWith('data:image/png;base64,')) {
    return raw;
  }
  if (raw.startsWith('data:image/jpeg;base64,')) {
    return raw;
  }
  return `data:image/png;base64,${raw}`;
}

/** Photo: JPEG/PNG data URL for Laravel POD / S3. */
function normalizePhotoPayload(raw: string): string {
  if (raw.startsWith('data:image/jpeg;base64,')) {
    return raw;
  }
  if (raw.startsWith('data:image/png;base64,')) {
    return raw;
  }
  return `data:image/jpeg;base64,${raw}`;
}

function assertCollectionId(p: CollectionPayload): string {
  const id = p.collectionId?.trim();
  if (id == null || id === '') {
    throw new Error('collectionId is required on collection events');
  }
  return id;
}

type GpsLocationQueuedPayload = {
  shipmentId?: string;
  points?: unknown;
};

type ShipmentEventPayload = {
  shipmentId?: string;
  failed_reason?: string;
  failed_reason_code?: string;
  failure_reason?: string;
  dni?: string;
  receiver_name?: string;
  relationship?: string;
  signature?: string;
  signature_base64?: string;
  photo?: string;
  photo_base64?: string;
  geo?: Record<string, unknown>;
};

/**
 * Persists domain events via `POST /events` (append + projection). Uses {@link QueueEvent.id} as `id` and idempotency.
 */
async function postDomainEvent(
  eventId: string,
  aggregateType: string,
  aggregateId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await apiClient.post(
    '/events',
    {
      id: eventId,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      type,
      payload,
    },
    idempotencyHeaders(eventId),
  );
}

/**
 * Maps queued {@link QueueEvent.type} values to API calls.
 */
export async function handleEvent(event: QueueEvent): Promise<void> {
  const { type, payload, id: eventId } = event;

  switch (type) {
    case EventType.COLLECTION_STARTED: {
      const p = payload as CollectionPayload;
      const collectionId = assertCollectionId(p);
      const body: Record<string, unknown> = {};
      if (p.businessId != null && p.businessId !== '') body.businessId = p.businessId;
      if (p.warehouseId != null && p.warehouseId !== '') body.warehouseId = p.warehouseId;
      if (p.businessName != null && p.businessName !== '') body.businessName = p.businessName;
      if (p.warehouseName != null && p.warehouseName !== '') body.warehouseName = p.warehouseName;
      if (p.driverUserId != null && p.driverUserId !== '') body.driverUserId = p.driverUserId;
      if (p.driverName != null && p.driverName !== '') body.driverName = p.driverName;
      await postDomainEvent(eventId, 'collection', collectionId, type, body);
      return;
    }

    case EventType.COLLECTION_ITEM_ADDED:
    case EventType.COLLECTION_ITEM_REMOVED: {
      const p = payload as CollectionPayload;
      const collectionId = assertCollectionId(p);
      const body: Record<string, unknown> = {};
      if (p.trackingId != null && p.trackingId !== '') body.trackingId = p.trackingId;
      if (p.raw != null && p.raw !== '') body.raw = p.raw;
      await postDomainEvent(eventId, 'collection', collectionId, type, body);
      return;
    }

    case EventType.COLLECTION_FINISHED: {
      const p = payload as CollectionPayload;
      const collectionId = assertCollectionId(p);
      if (!Array.isArray(p.items)) {
        throw new Error(`${EventType.COLLECTION_FINISHED}: expected items array`);
      }
      const items = await Promise.all(p.items.map(normalizeCollectionItem));
      await postDomainEvent(eventId, 'collection', collectionId, type, { items });
      return;
    }

    case EventType.SHIPMENT_SCANNED:
    case EventType.SHIPMENT_IN_TRANSIT:
    case EventType.SHIPMENT_NEAR_DESTINATION:
    case EventType.SHIPMENT_DELIVERED:
    case EventType.SHIPMENT_FAILED: {
      const p = payload as ShipmentEventPayload;
      const sid = p.shipmentId?.trim();
      if (sid == null || sid === '') {
        throw new Error(`${type}: expected payload.shipmentId`);
      }
      const body: Record<string, unknown> = {};
      if (p.failed_reason != null) body.failed_reason = p.failed_reason;
      if (p.failed_reason_code != null) body.failed_reason_code = p.failed_reason_code;
      if (p.failure_reason != null) body.failure_reason = p.failure_reason;

      if (type === EventType.SHIPMENT_DELIVERED) {
        const sigRaw =
          (typeof p.signature === 'string' ? p.signature : p.signature_base64)?.trim() ?? '';
        if (sigRaw !== '') {
          body.signature = normalizeSignaturePayload(sigRaw);
        }
        const photoRaw = (typeof p.photo === 'string' ? p.photo : p.photo_base64)?.trim() ?? '';
        if (photoRaw !== '') {
          body.photo = normalizePhotoPayload(photoRaw);
        }
        if (typeof p.dni === 'string' && p.dni.trim() !== '') {
          body.dni = p.dni.trim();
        }
        if (typeof p.receiver_name === 'string' && p.receiver_name.trim() !== '') {
          body.receiver_name = p.receiver_name.trim();
        }
        if (typeof p.relationship === 'string' && p.relationship.trim() !== '') {
          body.relationship = p.relationship.trim();
        }
        if (p.geo != null && typeof p.geo === 'object' && !Array.isArray(p.geo)) {
          body.geo = p.geo;
        }
      }

      if (type === EventType.SHIPMENT_FAILED) {
        const photoRaw = (typeof p.photo === 'string' ? p.photo : p.photo_base64)?.trim() ?? '';
        if (photoRaw !== '') {
          body.photo = normalizePhotoPayload(photoRaw);
        }
      }

      await postDomainEvent(eventId, 'shipment', sid, type, body);
      return;
    }

    case EventType.GPS_LOCATION: {
      const p = payload as GpsLocationQueuedPayload;
      const sid = p.shipmentId?.trim();
      if (sid == null || sid === '') {
        throw new Error(`${EventType.GPS_LOCATION}: expected payload.shipmentId`);
      }
      if (!Array.isArray(p.points) || p.points.length === 0) {
        throw new Error(`${EventType.GPS_LOCATION}: expected non-empty payload.points`);
      }
      await postDomainEvent(eventId, 'shipment', sid, type, { points: p.points });
      return;
    }

    default:
      throw new Error(`Unknown event type (not a known domain event): ${type}`);
  }
}
