import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@components/ui';
import {
  createDriverRoute,
  fetchDriverStops,
  type DriverDayTotals,
  type DriverRouteView,
} from '@core/api/routes';
import { useSyncRejectionStore } from '@core/sync';
import { useTheme, type AppTheme } from '@theme';

import { InternalRouteContent } from './InternalRouteContent';

/**
 * Bottom tab "Paradas" for drivers.
 *
 * Auto-syncs on focus: every time the tab gains focus we POST /driver/routes
 * (idempotent) so the backend adds any shipments assigned since the last sync
 * to today's active Route as new stops.
 *
 * En paralelo se pide GET /driver/stops: la jornada COMPLETA (propios + Flex)
 * agrupada por punto de entrega. El mapa dibuja eso, no sólo la ruta interna:
 * antes un chofer con sólo Flex veía "Sin envíos asignados" teniendo la
 * camioneta llena. La ruta interna sigue siendo la que se inicia/finaliza.
 * Si el backend es viejo (sin /driver/stops), se cae a las paradas de la ruta.
 *
 * The tab renders without a navigation header so the map reaches the top of the
 * screen; every state below therefore pads for the status bar itself.
 */
export function RouteMapTabScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [route, setRoute] = useState<DriverRouteView | null>(null);
  const [hasInternalRoute, setHasInternalRoute] = useState(false);
  const [totals, setTotals] = useState<DriverDayTotals | null>(null);
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
      const [routeRes, stopsRes] = await Promise.allSettled([createDriverRoute(), fetchDriverStops()]);

      const internal = routeRes.status === 'fulfilled' ? routeRes.value : null;
      if (routeRes.status === 'rejected' && !isNoShipmentsError(routeRes.reason)) {
        throw routeRes.reason;
      }
      const day = stopsRes.status === 'fulfilled' ? stopsRes.value : null;

      const stops = day !== null ? day.stops : (internal?.stops ?? []);
      if (stops.length === 0) {
        setRoute(null);
        setHasInternalRoute(false);
        setTotals(day?.totals ?? null);
        setEmpty(true);
        return;
      }

      setRoute(
        internal !== null
          ? { ...internal, stops }
          : {
              id: '',
              driverId: '',
              status: 'flex_only',
              date: day?.serviceDate ?? '',
              startedAt: null,
              finishedAt: null,
              stops,
            },
      );
      setHasInternalRoute(internal !== null);
      setTotals(day?.totals ?? null);
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

  // Un evento rechazado (Flex) cambia lo que el mapa debería mostrar.
  const rejectionSeq = useSyncRejectionStore((s) => s.seq);
  const lastSeq = useRef(rejectionSeq);
  if (lastSeq.current !== rejectionSeq) {
    lastSeq.current = rejectionSeq;
    void sync('refresh');
  }

  const emptyPadding = { paddingTop: insets.top + theme.spacing.xxl };

  if (loading && route === null) {
    return (
      <View style={[styles.empty, emptyPadding]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error !== null && route === null) {
    return (
      <View style={[styles.empty, emptyPadding]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.danger} />
        <Text style={styles.emptyTitle}>No pudimos cargar la ruta</Text>
        <Text style={styles.emptySubtitle}>{error}</Text>
        <View style={styles.actions}>
          <Button variant="primary" size="lg" onPress={() => void sync('initial')}>
            Reintentar
          </Button>
        </View>
      </View>
    );
  }

  if (empty || route === null || route.stops.length === 0) {
    return (
      <View style={[styles.empty, emptyPadding]}>
        <Ionicons name="map-outline" size={48} color={theme.colors.muted} />
        <Text style={styles.emptyTitle}>Sin envíos asignados</Text>
        <Text style={styles.emptySubtitle}>
          Cuando tengas envíos asignados vas a ver todas tus paradas en el mapa.
        </Text>
        <View style={styles.actions}>
          <Button variant="outline" size="lg" onPress={() => void sync('initial')}>
            Actualizar
          </Button>
        </View>
      </View>
    );
  }

  return (
    <InternalRouteContent
      route={route}
      onRefresh={onRefresh}
      hasInternalRoute={hasInternalRoute}
      totals={totals}
    />
  );
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
