import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { hasRole } from '@core/auth/types';
import { useAuthStore } from '@store/useAuthStore';

import { clearPendingLocations } from './driverLocationDb';
import { resetDriverLocationFilter } from './driverLocationIngest';
import { startDriverLocationTracking, stopDriverLocationTracking } from './driverLocationTracking';

/**
 * Starts production driver location capture (SQLite queue + background task) for authenticated drivers.
 */
export function DriverTrackingBootstrap() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasDriverRole = hasRole(user, 'DRIVER');
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (isAuthenticated && hasDriverRole) {
      wasAuthenticated.current = true;
      void startDriverLocationTracking();
    } else {
      void stopDriverLocationTracking();
      // Sólo en un cierre de sesión REAL (estaba autenticado y dejó de estarlo):
      // al arrancar la app la sesión todavía se está restaurando y borrar ahí
      // perdería los puntos offline del propio chofer.
      if (wasAuthenticated.current && !isAuthenticated) {
        wasAuthenticated.current = false;
        resetDriverLocationFilter();
        void clearPendingLocations();
      }
    }
    return () => {
      void stopDriverLocationTracking();
    };
  }, [isAuthenticated, hasDriverRole]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && useAuthStore.getState().isAuthenticated) {
        const u = useAuthStore.getState().user;
        if (hasRole(u, 'DRIVER')) {
          void startDriverLocationTracking();
        }
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
