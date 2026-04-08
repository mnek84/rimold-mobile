import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

import { haversineMeters } from '@core/location';
import { enqueueEvent, EventType } from '@core/sync';
import { getItem, setItem } from '@core/storage';

const storageKey = (shipmentId: string) => `delivery_near_dest:${shipmentId}`;

export type NearDestinationGeofenceOptions = {
  shipmentId: string;
  /** Destination (next stop) coordinates */
  latitude: number;
  longitude: number;
  /** Trigger radius in meters */
  radiusMeters?: number;
  enabled: boolean;
};

/**
 * While enabled, watches foreground location and enqueues {@link EventType.SHIPMENT_NEAR_DESTINATION}
 * once when the device enters the radius. Persisted per shipment so restarts do not duplicate.
 */
export function useNearDestinationGeofence(options: NearDestinationGeofenceOptions): void {
  const { shipmentId, latitude, longitude, radiusMeters = 100, enabled } = options;
  const firedThisSession = useRef(false);

  useEffect(() => {
    if (!enabled || shipmentId.trim() === '') {
      return;
    }

    let subscription: Location.LocationSubscription | null = null;

    const run = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const persisted = await getItem(storageKey(shipmentId));
      if (persisted === '1') {
        firedThisSession.current = true;
        return;
      }

      const tryFire = async (lat: number, lng: number) => {
        if (firedThisSession.current) {
          return;
        }
        const stored = await getItem(storageKey(shipmentId));
        if (stored === '1') {
          firedThisSession.current = true;
          return;
        }
        const d = haversineMeters(lat, lng, latitude, longitude);
        if (d > radiusMeters) {
          return;
        }
        firedThisSession.current = true;
        try {
          await enqueueEvent({
            type: EventType.SHIPMENT_NEAR_DESTINATION,
            payload: { shipmentId: shipmentId.trim() },
          });
          await setItem(storageKey(shipmentId), '1');
        } catch {
          firedThisSession.current = false;
        }
      };

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 12_000,
          distanceInterval: 25,
        },
        (loc) => {
          void tryFire(loc.coords.latitude, loc.coords.longitude);
        },
      );
    };

    void run();

    return () => {
      subscription?.remove();
    };
  }, [enabled, shipmentId, latitude, longitude, radiusMeters]);
}
