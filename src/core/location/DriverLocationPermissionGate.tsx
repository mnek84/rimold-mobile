import { useSyncExternalStore } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@components/ui';
import { useTheme } from '@theme';

import {
  getDriverLocationBlockedReason,
  subscribeDriverLocationBlocked,
} from './driverLocationTracking';

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
      <View
        style={[
          styles.backdrop,
          { backgroundColor: theme.colors.scrim, paddingHorizontal: theme.spacing.xl },
        ]}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.spacing.radiusCard,
              padding: theme.spacing.xl,
              gap: theme.spacing.lg,
            },
          ]}
        >
          <Text style={[styles.title, theme.typography.title, { color: theme.colors.text }]}>
            Ubicación requerida
          </Text>
          <Text style={[styles.body, theme.typography.body, { color: theme.colors.muted }]}>{blocked}</Text>
          <Button
            size="lg"
            icon="settings-outline"
            onPress={() => {
              void Linking.openSettings();
            }}
          >
            Abrir ajustes
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
});
