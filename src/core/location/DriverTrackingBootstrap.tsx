import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuthStore } from '@store/useAuthStore';

import { startDriverLocationTracking, stopDriverLocationTracking } from './driverLocationTracking';

/**
 * Starts production driver location capture (SQLite queue + background task) for authenticated drivers.
 */
export function DriverTrackingBootstrap() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'DRIVER') {
      void startDriverLocationTracking();
    } else {
      void stopDriverLocationTracking();
    }
    return () => {
      void stopDriverLocationTracking();
    };
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && useAuthStore.getState().isAuthenticated) {
        const u = useAuthStore.getState().user;
        if (u?.role === 'DRIVER') {
          void startDriverLocationTracking();
        }
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
