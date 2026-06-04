import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Subscribe to NetInfo and expose a boolean that flips when connectivity changes.
 * Uses the same definition of "online" as {@link ./syncEngine.isOnline}: connected and
 * internet-reachable (treating `null` reachability as still online to avoid false negatives).
 *
 * Initial value is `true` until NetInfo reports otherwise so that components do not flash an
 * "offline" state during the first paint while the first fetch resolves.
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    void NetInfo.fetch().then((s) => {
      if (!active) return;
      setIsOnline(s.isConnected === true && s.isInternetReachable !== false);
    });

    const unsub = NetInfo.addEventListener((s) => {
      setIsOnline(s.isConnected === true && s.isInternetReachable !== false);
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  return isOnline;
}
