import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { CHECK_INTERVAL_MS } from './constants';
import { useAppUpdateStore } from './appUpdateStore';

/**
 * Checks for APK updates on cold start, when returning to foreground (if due),
 * and on a 6-hour interval while the app stays open.
 */
export function AppUpdateBootstrap() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    void useAppUpdateStore.getState().hydrateLastCheckedAt().then(() => {
      void useAppUpdateStore.getState().checkForUpdate();
    });
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void useAppUpdateStore.getState().checkForUpdate();
    }, CHECK_INTERVAL_MS);

    const appSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        void useAppUpdateStore.getState().checkForUpdate();
      }
      appState.current = next;
    });

    return () => {
      clearInterval(intervalId);
      appSub.remove();
    };
  }, []);

  return null;
}
