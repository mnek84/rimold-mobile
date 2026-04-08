import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { processQueueIfOnline } from './syncEngine';
import { useSyncStatusStore } from './syncStatusStore';

/**
 * Triggers background sync on cold start, foreground, and when connectivity is restored.
 * Does not render UI.
 */
export function SyncBootstrap() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    void useSyncStatusStore.getState().hydrateFromStorage();
  }, []);

  useEffect(() => {
    void processQueueIfOnline();

    const appSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        void useSyncStatusStore.getState().refresh();
        void processQueueIfOnline();
      }
      appState.current = next;
    });

    const netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected === true && state.isInternetReachable !== false) {
        void processQueueIfOnline();
      }
    });

    return () => {
      appSub.remove();
      netUnsub();
    };
  }, []);

  return null;
}
