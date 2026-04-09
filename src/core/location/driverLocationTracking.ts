import * as Location from 'expo-location';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { ingestDriverLocationObject } from './driverLocationIngest';
import { startDriverLocationSyncWorker, stopDriverLocationSyncWorker } from './driverLocationSyncWorker';
import { BACKGROUND_LOCATION_TASK } from './driverLocationTaskRegister';

let started = false;
let watchSub: Location.LocationSubscription | null = null;
let appStateSub: { remove: () => void } | null = null;

const statusListeners = new Set<() => void>();
let blockedReason: string | null = null;

function emitStatus(): void {
  for (const fn of statusListeners) {
    fn();
  }
}

function setBlockedReason(reason: string | null): void {
  blockedReason = reason;
  emitStatus();
}

export function getDriverLocationBlockedReason(): string | null {
  return blockedReason;
}

export function subscribeDriverLocationBlocked(onChange: () => void): () => void {
  statusListeners.add(onChange);
  return () => {
    statusListeners.delete(onChange);
  };
}

function backgroundTaskOptions(): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: true,
    foregroundService: {
      notificationTitle: 'Tracking activo',
      notificationBody: 'Tu ubicación está siendo compartida',
    },
  };
}

/**
 * SQLite-backed queue sync, background {@link Location.startLocationUpdatesAsync}, and a foreground watch
 * so fixes keep arriving while the app is open (OS may throttle background callbacks).
 */
export async function startDriverLocationTracking(): Promise<void> {
  if (Platform.OS === 'web') {
    setBlockedReason(null);
    return;
  }

  if (started) {
    startDriverLocationSyncWorker();
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status === Location.PermissionStatus.GRANTED) {
      setBlockedReason(null);
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (!running) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, backgroundTaskOptions());
        }
      } catch {
        /* keep foreground watch if any */
      }
    }
    return;
  }

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) {
    setBlockedReason('Se necesita permiso de ubicación para registrar tu ruta.');
    return;
  }

  startDriverLocationSyncWorker();
  setBlockedReason(null);

  void Location.requestBackgroundPermissionsAsync();

  let hasSource = false;

  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (!running) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, backgroundTaskOptions());
    }
    hasSource = true;
  } catch {
    /* Foreground watch may still deliver fixes */
  }

  try {
    watchSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      (loc) => {
        void ingestDriverLocationObject(loc);
      },
    );
    hasSource = true;
  } catch {
    /* Background task may still deliver fixes */
  }

  if (!hasSource) {
    stopDriverLocationSyncWorker();
    setBlockedReason('No se pudo iniciar el seguimiento de ubicación.');
    return;
  }

  appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') {
      void Location.getForegroundPermissionsAsync().then((r) => {
        if (r.status === Location.PermissionStatus.GRANTED) {
          setBlockedReason(null);
        }
      });
    }
  });

  started = true;
}

export async function stopDriverLocationTracking(): Promise<void> {
  stopDriverLocationSyncWorker();
  setBlockedReason(null);

  if (Platform.OS === 'web' || !started) {
    started = false;
    return;
  }

  watchSub?.remove();
  watchSub = null;
  appStateSub?.remove();
  appStateSub = null;

  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (running) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch {
    /* ignore */
  }

  started = false;
}
