import { useSyncExternalStore } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getDriverLocationBlockedReason,
  subscribeDriverLocationBlocked,
} from './driverLocationTracking';
import { useTheme } from '@theme';

/**
 * Blocks interaction until the driver grants location access (foreground / always).
 */
export function DriverLocationPermissionGate() {
  const theme = useTheme();
  const blocked = useSyncExternalStore(
    subscribeDriverLocationBlocked,
    getDriverLocationBlockedReason,
    () => null,
  );

  if (blocked == null) {
    return null;
  }

  return (
    <Modal animationType="fade" statusBarTranslucent transparent visible>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.78)' }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.title, theme.typography.title, { color: theme.colors.text }]}>
            Ubicación requerida
          </Text>
          <Text style={[styles.body, theme.typography.body, { color: theme.colors.muted }]}>{blocked}</Text>
          <Pressable
            onPress={() => {
              void Linking.openSettings();
            }}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.buttonLabel, theme.typography.bodyStrong, { color: theme.colors.primaryOn }]}>
              Abrir ajustes
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonLabel: {},
});
