import type { LocationObject } from 'expo-location';

import { isOnline } from '@core/sync/syncEngine';

import { insertPendingLocation } from './driverLocationDb';
import { syncDriverLocationQueueOnce } from './driverLocationSyncWorker';
import type { PendingLocation } from './driverLocationTypes';

export function sampleFromLocationObject(loc: LocationObject): Omit<PendingLocation, 'id' | 'synced'> {
  const { latitude, longitude, heading, speed, accuracy } = loc.coords;
  const timestamp =
    loc.timestamp != null && Number.isFinite(loc.timestamp) ? Math.round(loc.timestamp) : Date.now();
  return {
    lat: latitude,
    lng: longitude,
    heading: heading != null && Number.isFinite(heading) && heading >= 0 ? heading : undefined,
    speed: speed != null && Number.isFinite(speed) && speed >= 0 ? speed : undefined,
    accuracy: accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : undefined,
    timestamp,
  };
}

/**
 * Queue one fix locally, then try an immediate sync when the device is online.
 */
export async function ingestDriverLocationObject(loc: LocationObject): Promise<void> {
  await insertPendingLocation(sampleFromLocationObject(loc));
  if (await isOnline()) {
    void syncDriverLocationQueueOnce();
  }
}
