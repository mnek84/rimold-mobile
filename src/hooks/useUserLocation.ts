import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { isValidLatLng } from '@core/geo/coordinates';

/** Used when permission is denied, services are off, or position cannot be read. */
const FALLBACK_LATITUDE = -34.6037;
const FALLBACK_LONGITUDE = -58.3816;

export type UseUserLocationResult = {
  latitude: number | null;
  longitude: number | null;
  /** True until the first permission + location attempt finishes (success or fallback). */
  loading: boolean;
  /** True when coordinates are the fallback, not the device. */
  isFallback: boolean;
  /** Foreground location permission was not granted (denied / restricted). */
  permissionDenied: boolean;
};

/**
 * Foreground user location via expo-location. Never throws; invalid or missing location uses fallback coords.
 */
export function useUserLocation(): UseUserLocationResult {
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const applyFallback = useCallback(() => {
    setLatitude(FALLBACK_LATITUDE);
    setLongitude(FALLBACK_LONGITUDE);
    setIsFallback(true);
  }, []);

  const resolve = useCallback(async () => {
    setLoading(true);
    try {
      setPermissionDenied(false);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== Location.PermissionStatus.GRANTED) {
        setPermissionDenied(true);
        applyFallback();
        return;
      }

      let servicesOk = true;
      try {
        servicesOk = await Location.hasServicesEnabledAsync();
      } catch {
        servicesOk = true;
      }
      if (!servicesOk) {
        applyFallback();
        return;
      }

      let position: Location.LocationObject | null = null;
      try {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      } catch {
        position = null;
      }

      if (position === null) {
        applyFallback();
        return;
      }

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      if (!isValidLatLng(lat, lng)) {
        applyFallback();
        return;
      }

      setLatitude(lat);
      setLongitude(lng);
      setIsFallback(false);
    } catch {
      setPermissionDenied(false);
      applyFallback();
    } finally {
      setLoading(false);
    }
  }, [applyFallback]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  return { latitude, longitude, loading, isFallback, permissionDenied };
}
