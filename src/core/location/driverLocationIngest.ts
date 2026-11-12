import type { LocationObject } from 'expo-location';

import { isOnline } from '@core/sync/syncEngine';
import { usePickupOrderActiveStore } from '@modules/pickups/store/pickupOrderActiveStore';

import { insertPendingLocation } from './driverLocationDb';
import { shouldKeepFix, type FixSample } from './driverLocationFilter';
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
    pickup_order_id: usePickupOrderActiveStore.getState().activeOrderId,
  };
}

/** Último fix encolado. Vive en memoria: tras reiniciar la app el primero siempre entra. */
let lastKept: FixSample | null = null;

/** Para tests y para el cierre de sesión. */
export function resetDriverLocationFilter(): void {
  lastKept = null;
}

/**
 * Queue one fix locally, then try an immediate sync when the device is online.
 * Duplicados (dos fuentes en primer plano), fuera de orden y ruido con el
 * chofer detenido no se encolan: ver `driverLocationFilter`.
 */
export async function ingestDriverLocationObject(loc: LocationObject): Promise<void> {
  const sample = sampleFromLocationObject(loc);
  if (!shouldKeepFix(lastKept, sample).keep) {
    return;
  }
  lastKept = sample;
  await insertPendingLocation(sample);
  if (await isOnline()) {
    void syncDriverLocationQueueOnce();
  }
}
