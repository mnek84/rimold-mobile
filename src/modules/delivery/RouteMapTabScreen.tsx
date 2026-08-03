import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@components/ui';
import { createDriverRoute, type DriverRouteView } from '@core/api/routes';
import { useTheme, type AppTheme } from '@theme';

import { InternalRouteContent } from './InternalRouteContent';

/**
 * Bottom tab "Ruta" for drivers.
 *
 * Auto-syncs on focus: every time the tab gains focus we POST /driver/routes
 * (idempotent) so the backend adds any shipments assigned since the last sync
 * to today's active Route as new stops. The response is the full Route, which
 * we render directly — no separate "Crear ruta" CTA.
 */
export function RouteMapTabScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [route, setRoute] = useState<DriverRouteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const sync = useCallback(async (mode: 'initial' | 'refresh') => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (mode === 'initial') {
      setLoading(true);
    }
    setError(null);
    try {
      const r = await createDriverRoute();
      setRoute(r);
      setEmpty(false);
    } catch (e) {
      if (isNoShipmentsError(e)) {
        setRoute(null);
        setEmpty(true);
      } else {
        setError(messageForSyncError(e));
      }
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void sync('initial');
    }, [sync]),
  );

  const onRefresh = useCallback(async () => {
    await sync('refresh');
  }, [sync]);

  if (loading && route === null) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error !== null && route === null) {
    return (
      <View style={styles.empty}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.danger} />
        <Text style={styles.emptyTitle}>No pudimos cargar la ruta</Text>
        <Text style={styles.emptySubtitle}>{error}</Text>
        <View style={styles.actions}>
          <Button variant="primary" onPress={() => void sync('initial')}>
            Reintentar
          </Button>
        </View>
      </View>
    );
  }

  if (empty || route === null || route.stops.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="map-outline" size={48} color={theme.colors.muted} />
        <Text style={styles.emptyTitle}>Sin envíos asignados</Text>
        <Text style={styles.emptySubtitle}>
          Cuando tengas envíos asignados vas a poder ver tu ruta desde acá.
        </Text>
      </View>
    );
  }

  return <InternalRouteContent route={route} onRefresh={onRefresh} />;
}

function isNoShipmentsError(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 422;
}

function messageForSyncError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (e.response?.status === 401) {
      return 'Sesión expirada o no válida. Volvé a iniciar sesión.';
    }
    const m = e.response?.data?.message;
    if (typeof m === 'string' && m.trim() !== '') {
      return m;
    }
  }
  return 'No se pudo cargar la ruta.';
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
  });
}
