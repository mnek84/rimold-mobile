import { apiClient } from '@core/api/client';

import type { PendingLocationRow } from './driverLocationDb';

const BATCH_PATH = '/driver/location/batch';

export type DriverLocationBatchPayloadItem = {
  lat: number;
  lng: number;
  timestamp: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
};

function rowToPayloadItem(row: PendingLocationRow): DriverLocationBatchPayloadItem {
  const item: DriverLocationBatchPayloadItem = {
    lat: row.lat,
    lng: row.lng,
    timestamp: row.timestamp,
  };
  if (row.heading !== undefined && Number.isFinite(row.heading)) {
    item.heading = row.heading;
  }
  if (row.speed !== undefined && Number.isFinite(row.speed)) {
    item.speed = row.speed;
  }
  if (row.accuracy !== undefined && Number.isFinite(row.accuracy)) {
    item.accuracy = row.accuracy;
  }
  return item;
}

/**
 * Sends up to 20 points as a JSON array (gzip left to HTTP stack / optional follow-up).
 */
export async function postDriverLocationBatch(rows: PendingLocationRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const body = rows.map(rowToPayloadItem);
  await apiClient.post(BATCH_PATH, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });
}
