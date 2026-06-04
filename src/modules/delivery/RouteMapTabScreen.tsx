import axios from 'axios';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@components/ui';
import { createDriverRoute } from '@core/api/routes';
import { useDeliveryStore } from '@store/useDeliveryStore';
import { useTheme, type AppTheme } from '@theme';

import { InternalRouteContent } from './InternalRouteContent';

/**
 * Bottom tab "Ruta" for drivers.
 *
 *  - With an active internal route assigned: render the map.
 *  - With shipments assigned but no route yet: show the "Crear ruta" CTA so the
 *    driver can self-service build today's route from his assigned shipments
 *    (POST /driver/routes).
 *  - With no shipments at all: empty state.
 */
export function RouteMapTabScreen() {
  const totalShipments = useDeliveryStore((s) => s.totalShipments);
  const routeId = useDeliveryStore((s) => s.internalRouteId);
  const setDeliveryData = useDeliveryStore((s) => s.setDeliveryData);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const onCreateRoute = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const route = await createDriverRoute();
      setDeliveryData(Math.max(totalShipments, route.stops.length), route.id);
    } catch (e) {
      setCreateError(messageForCreateRouteError(e));
    } finally {
      setCreating(false);
    }
  }, [setDeliveryData, totalShipments]);

  if (routeId !== null) {
    return <InternalRouteContent routeId={routeId} />;
  }

  if (totalShipments <= 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="map-outline" size={48} color={theme.colors.muted} />
        <Text style={styles.emptyTitle}>Sin envíos asignados</Text>
        <Text style={styles.emptySubtitle}>
          Cuando tengas envíos asignados vas a poder crear tu ruta desde acá.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.empty}>
      <Ionicons name="navigate-outline" size={48} color={theme.colors.muted} />
      <Text style={styles.emptyTitle}>Aún no creaste la ruta</Text>
      <Text style={styles.emptySubtitle}>
        Tenés {totalShipments} {totalShipments === 1 ? 'envío asignado' : 'envíos asignados'}. Tocá "Crear ruta"
        para armar la ruta del día.
      </Text>
      <View style={styles.actions}>
        <Button variant="primary" loading={creating} onPress={() => void onCreateRoute()}>
          Crear ruta
        </Button>
        {createError !== null && <Text style={styles.errorText}>{createError}</Text>}
      </View>
    </View>
  );
}

function messageForCreateRouteError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    if (status === 401) {
      return 'Sesión expirada o no válida. Volvé a iniciar sesión.';
    }
    if (status === 422) {
      const errs = e.response?.data?.errors;
      if (errs !== null && typeof errs === 'object') {
        const list = Object.values(errs as Record<string, unknown>).flat();
        const first = list.find((v) => typeof v === 'string' && v !== '');
        if (typeof first === 'string') {
          return first;
        }
      }
      const m = e.response?.data?.message;
      if (typeof m === 'string' && m.trim() !== '') {
        return m;
      }
      return 'No hay envíos disponibles para armar la ruta.';
    }
    const m = e.response?.data?.message;
    if (typeof m === 'string' && m.trim() !== '') {
      return m;
    }
  }
  return 'No se pudo crear la ruta.';
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
    actions: {
      width: '100%',
      maxWidth: 320,
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
      textAlign: 'center',
    },
  });
}
