import * as Location from 'expo-location';

import { setGpsActiveShipmentId } from './gpsActiveShipment';
import {
  appendGpsPoint,
  DEFAULT_MIN_MOVEMENT_M,
  flushGpsPendingFinal,
  setGpsMovementThresholdMeters,
} from './gpsPendingBuffer';

export type GpsTrackerConfig = {
  /** Shipment UUID; GPS events are stored against this aggregate. */
  shipmentId: string;
  /** Minimum time between updates (ms). */
  timeIntervalMs: number;
  /** Minimum movement between updates (meters). */
  distanceIntervalM: number;
  /**
   * After rounding to 4 decimals, fixes closer than this to the last kept point are dropped.
   */
  minMovementMeters?: number;
  accuracy?: Location.LocationAccuracy;
};

const DEFAULT_CONFIG: Omit<GpsTrackerConfig, 'shipmentId'> = {
  timeIntervalMs: 30_000,
  distanceIntervalM: 25,
  minMovementMeters: DEFAULT_MIN_MOVEMENT_M,
  accuracy: Location.Accuracy.Balanced,
};

export type StartGpsTrackingOptions = Partial<Omit<GpsTrackerConfig, 'shipmentId'>> & {
  shipmentId: string;
};

let subscription: Location.LocationSubscription | null = null;

function coordsToSample(location: Location.LocationObject): {
  lat: number;
  lng: number;
  timestamp: number;
} {
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    timestamp:
      location.timestamp != null && Number.isFinite(location.timestamp)
        ? Math.round(location.timestamp)
        : Date.now(),
  };
}

/**
 * Foreground location updates: OS delivers fixes when either time or distance threshold is met.
 * Points are batched and enqueued via {@link appendGpsPoint} (offline-safe).
 */
export async function startGpsTracking(options: StartGpsTrackingOptions): Promise<void> {
  if (subscription != null) {
    return;
  }

  const sid = options.shipmentId.trim();
  if (sid === '') {
    throw new Error('startGpsTracking: shipmentId is required');
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission not granted');
  }

  const merged: GpsTrackerConfig = {
    ...DEFAULT_CONFIG,
    ...options,
    shipmentId: sid,
  };
  setGpsActiveShipmentId(sid);
  setGpsMovementThresholdMeters(merged.minMovementMeters ?? DEFAULT_MIN_MOVEMENT_M);

  subscription = await Location.watchPositionAsync(
    {
      accuracy: merged.accuracy,
      timeInterval: merged.timeIntervalMs,
      distanceInterval: merged.distanceIntervalM,
    },
    (location) => {
      void appendGpsPoint(coordsToSample(location));
    },
  );
}

/**
 * Stops watching and flushes any pending coordinates (even a partial batch).
 */
export async function stopGpsTracking(): Promise<void> {
  if (subscription != null) {
    subscription.remove();
    subscription = null;
  }
  await flushGpsPendingFinal();
  setGpsActiveShipmentId(null);
}

export function isGpsTrackingActive(): boolean {
  return subscription != null;
}

export { DEFAULT_CONFIG as defaultGpsTrackerConfig };
