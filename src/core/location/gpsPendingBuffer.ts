import { createEventUuid, enqueueEvent, EventType } from '@core/sync';
import { getJSON, setJSON } from '@core/storage';

import { getGpsActiveShipmentId } from './gpsActiveShipment';
import { shouldKeepWirePoint, toWirePoint, type GpsWirePoint } from './gpsOptimize';

const STORAGE_KEY = 'gps_pending_points';

/** Minimum points before a batch is enqueued during active tracking. */
export const GPS_BATCH_MIN = 10;
/** Maximum points per single `GPS_LOCATION` event. */
export const GPS_BATCH_MAX = 20;

/** Default: ignore fixes closer than this to the last kept point (after rounding). */
export const DEFAULT_MIN_MOVEMENT_M = 12;

let minMovementMeters = DEFAULT_MIN_MOVEMENT_M;

export function setGpsMovementThresholdMeters(meters: number): void {
  minMovementMeters = Number.isFinite(meters) && meters > 0 ? meters : DEFAULT_MIN_MOVEMENT_M;
}

export function getGpsMovementThresholdMeters(): number {
  return minMovementMeters;
}

/** Alias of {@link GpsWirePoint} for older imports. */
export type GpsLocationPoint = GpsWirePoint;

let gate = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = gate.then(fn);
  gate = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function parseStoredRow(row: unknown): GpsWirePoint | null {
  if (row === null || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const lat = r.lat;
  const lng = r.lng;
  const t = r.t ?? r.timestamp;
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof t !== 'number') {
    return null;
  }
  return toWirePoint(lat, lng, t);
}

async function loadPending(): Promise<GpsWirePoint[]> {
  const raw = await getJSON<unknown>(STORAGE_KEY);
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: GpsWirePoint[] = [];
  for (const row of raw) {
    const p = parseStoredRow(row);
    if (p != null) {
      out.push(p);
    }
  }
  return out;
}

async function savePending(points: GpsWirePoint[]): Promise<void> {
  await setJSON(STORAGE_KEY, points);
}

async function enqueueBatch(points: GpsWirePoint[]): Promise<void> {
  if (points.length === 0) {
    return;
  }
  const shipmentId = getGpsActiveShipmentId();
  if (shipmentId == null) {
    throw new Error('GPS batch enqueue requires an active shipment (call startGpsTracking with shipmentId)');
  }
  await enqueueEvent({
    id: createEventUuid(),
    type: EventType.GPS_LOCATION,
    payload: {
      shipmentId,
      points,
    },
  });
}

export type GpsRawSample = {
  lat: number;
  lng: number;
  timestamp: number;
};

/**
 * Normalize, drop minimal movement vs last pending point, then batch-enqueue when thresholds met.
 */
export async function appendGpsPoint(sample: GpsRawSample): Promise<void> {
  const wire = toWirePoint(sample.lat, sample.lng, sample.timestamp);

  await runExclusive(async () => {
    let cur = await loadPending();
    const last = cur.length > 0 ? cur[cur.length - 1]! : null;
    if (!shouldKeepWirePoint(last, wire, minMovementMeters)) {
      return;
    }
    cur.push(wire);

    while (cur.length >= GPS_BATCH_MIN) {
      const take = Math.min(cur.length, GPS_BATCH_MAX);
      const chunk = cur.slice(0, take);
      cur = cur.slice(take);
      await savePending(cur);
      await enqueueBatch(chunk);
    }
    await savePending(cur);
  });
}

/**
 * Enqueue all pending points (e.g. on tracking stop), even if fewer than {@link GPS_BATCH_MIN}.
 */
export async function flushGpsPendingFinal(): Promise<void> {
  await runExclusive(async () => {
    const pending = await loadPending();
    if (pending.length === 0) {
      return;
    }
    await savePending([]);
    await enqueueBatch(pending);
  });
}
