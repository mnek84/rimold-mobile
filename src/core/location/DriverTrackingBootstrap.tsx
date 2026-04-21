import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { hasRole } from '@core/auth/types';
import { useAuthStore } from '@store/useAuthStore';

import { startDriverLocationTracking, stopDriverLocationTracking } from './driverLocationTracking';

/**
 * Starts production driver location capture (SQLite queue + background task) for authenticated drivers.
 */
export function DriverTrackingBootstrap() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasDriverRole = hasRole(user, 'DRIVER');

  useEffect(() => {
    if (isAuthenticated && hasDriverRole) {
      void startDriverLocationTracking();
    } else {
      void stopDriverLocationTracking();
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
