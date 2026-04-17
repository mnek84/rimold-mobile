import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useDeliveryStore } from '@store/useDeliveryStore';
import { useTheme, type AppTheme } from '@theme';

import { InternalRouteContent } from './InternalRouteContent';

/**
 * Shown as the "Ruta" bottom tab for drivers.
 * Only rendered when the driver has >1 shipment and an internal route assigned.
 * The tab itself is hidden from the tab bar when the condition is not met
 * (controlled by AppNavigator via tabBarButton).
 */
export function RouteMapTabScreen() {
  const totalShipments = useDeliveryStore((s) => s.totalShipments);
  const routeId = useDeliveryStore((s) => s.internalRouteId);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (totalShipments <= 1 || routeId === null) {
    return (
      <View style={styles.empty}>
        <Ionicons name="map-outline" size={48} color={theme.colors.muted} />
        <Text style={styles.emptyTitle}>Sin ruta disponible</Text>
        <Text style={styles.emptySubtitle}>
          La ruta se muestra cuando tenés más de un envío asignado.
        </Text>
      </View>
    );
  }

  return <InternalRouteContent routeId={routeId} />;
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    empty: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xxl,
      gap: spacing.md,
    },
    emptyTitle: {
      ...typography.subtitle,
      color: colors.text,
      textAlign: 'center',
    },
    emptySubtitle: {
      ...typography.body,
      color: colors.muted,
      textAlign: 'center',
    },
  });
}
