import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button, ScreenContainer } from '@components/ui';
import {
  finishDriverRoute,
  optimizeRoute,
  startDriverRoute,
  type DriverRouteView,
  type RouteStopView,
} from '@core/api/routes';
import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { showToast } from '@core/feedback/toastStore';
import { isValidLatLng } from '@core/geo/coordinates';
import { decodeOsrmPolyline } from '@core/geo/decodeOsrmPolyline';
import { useTheme, type AppTheme } from '@theme';
import axios from 'axios';

import { isTerminalStopStatus, routeStopStatusLabel } from './routeStopStatus';

type Props = {
  route: DriverRouteView;
  onRefresh: () => Promise<void>;
};

function formatDrivingDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  const m = Math.round(seconds / 60);
  if (m < 60) {
    return `~${m} min`;
  }
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `~${h} h ${mm} min` : `~${h} h`;
}

function formatStartedAt(iso: string | null): string | null {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function pendingStopsCountFrom(err: unknown): number | null {
  if (!axios.isAxiosError(err)) return null;
  if (err.response?.status !== 422) return null;
  const errors = err.response.data?.errors;
  const arr = errors?.pending_stops;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const first = typeof arr[0] === 'string' ? arr[0] : '';
  const match = first.match(/(\d+)/);
  return match !== null ? Number(match[1]) : null;
}

export function InternalRouteContent({ route, onRefresh }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);

  const started = route.startedAt !== null && route.finishedAt === null;
  const finished = route.finishedAt !== null;

  const [polylineCoords, setPolylineCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | 'start' | 'reoptimize' | 'finish'>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // Only reset the visual cache (polyline / ETA) when the underlying route changes.
  // Appended stops do NOT reset these — the server tracks started/finished state.
  useEffect(() => {
    setPolylineCoords([]);
    setDurationSec(null);
    setDistanceM(null);
    setActionError(null);
  }, [route.id]);

  // Notify the driver when new stops are appended after the route has started.
  const previousStopsCount = useRef<number>(route.stops.length);
  useEffect(() => {
    const previous = previousStopsCount.current;
    const current = route.stops.length;
    if (started && current > previous) {
      const added = current - previous;
      showToast(
        added === 1
          ? 'Se agregó una parada nueva a tu ruta'
          : `Se agregaron ${added} paradas nuevas a tu ruta`,
      );
    }
    previousStopsCount.current = current;
  }, [route.stops.length, started]);

  // Una parada con novedad (entregada, fallida u omitida) ya no es trabajo
  // pendiente: sale de la lista y del mapa para que el repartidor no la
  // confunda con una visita que le falta. No se descarta — queda en el bloque
  // desplegable de cerradas, con su desenlace.
  const activeStops = useMemo(() => {
    return route.stops.filter((s) => !isTerminalStopStatus(s.status));
  }, [route.stops]);

  const doneStops = useMemo(() => {
    return route.stops.filter((s) => isTerminalStopStatus(s.status));
  }, [route.stops]);

  const stopsWithCoords = useMemo(() => {
    return activeStops.filter(
      (s) => s.latitude !== null && s.longitude !== null && isValidLatLng(s.latitude, s.longitude),
    );
  }, [activeStops]);

  // La primera parada abierta, no la primera `pending`: una parada en
  // `en_route` o `arrived` es la que el repartidor está haciendo ahora.
  const nextStop: RouteStopView | null = useMemo(() => {
    return activeStops[0] ?? null;
  }, [activeStops]);

  const applyOptimizeResult = useCallback(
    (res: { polyline: string; duration: number; distance: number }) => {
      setPolylineCoords(decodeOsrmPolyline(res.polyline));
      setDurationSec(res.duration);
      setDistanceM(res.distance);
    },
    [],
  );

  const onStartRoute = useCallback(async () => {
    setBusy('start');
    setActionError(null);
    try {
      const res = await optimizeRoute(route.id);
      applyOptimizeResult(res);
      await startDriverRoute(route.id);
      await onRefresh();
    } catch (e) {
      setActionError(messageForShipmentListError(e));
    } finally {
      setBusy(null);
    }
  }, [route.id, applyOptimizeResult, onRefresh]);

  const onReoptimize = useCallback(async () => {
    setBusy('reoptimize');
    setActionError(null);
    try {
      const res = await optimizeRoute(route.id);
      applyOptimizeResult(res);
    } catch (e) {
      setActionError(messageForShipmentListError(e));
    } finally {
      setBusy(null);
    }
  }, [route.id, applyOptimizeResult]);

  const finishNow = useCallback(
    async (force: boolean) => {
      setBusy('finish');
      setActionError(null);
      try {
        await finishDriverRoute(route.id, { force });
        await onRefresh();
      } catch (e) {
        const pending = pendingStopsCountFrom(e);
        if (pending !== null) {
          Alert.alert(
            'Finalizar ruta',
            `Quedan ${pending} paradas sin entregar. ¿Finalizar de todos modos?`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Finalizar',
                style: 'destructive',
                onPress: () => {
                  void finishNow(true);
                },
              },
            ],
          );
          return;
        }
        setActionError(messageForShipmentListError(e));
      } finally {
        setBusy(null);
      }
    },
    [route.id, onRefresh],
  );

  const onFinishRoute = useCallback(() => {
    void finishNow(false);
  }, [finishNow]);

  useEffect(() => {
    const coords = [
      ...stopsWithCoords.map((s) => ({ latitude: s.latitude!, longitude: s.longitude! })),
      ...polylineCoords,
    ];
    if (coords.length === 0 || mapRef.current == null) return;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [stopsWithCoords, polylineCoords]);

  const openGoogleMapsNext = useCallback(() => {
    if (nextStop === null || nextStop.latitude === null || nextStop.longitude === null) return;
    const { latitude, longitude } = nextStop;
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`);
  }, [nextStop]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const routeColor = theme.colors.success;
  const startedAtLabel = formatStartedAt(route.startedAt);

  const renderStop = (s: RouteStopView, isNext: boolean) => {
    const done = isTerminalStopStatus(s.status);
    const localityParts = [s.city, s.state].filter((v): v is string => v !== null);
    const localityLine =
      localityParts.length > 0 || s.postalCode !== null
        ? [localityParts.join(', '), s.postalCode !== null ? `CP ${s.postalCode}` : null]
            .filter((v): v is string => v !== null && v !== '')
            .join(' · ')
        : null;
    return (
      <View
        key={s.id}
        style={[styles.stopRow, isNext && styles.stopRowNext, done && styles.stopRowDone]}
      >
        <Text style={[styles.stopSeq, done && styles.stopSeqDone]}>{s.sequence}</Text>
        <View style={styles.stopBody}>
          <Text style={styles.stopTitle}>
            {isNext ? 'Siguiente · ' : ''}Parada {s.sequence}
          </Text>
          <Text style={styles.muted} numberOfLines={2}>
            {s.label ?? '—'}
          </Text>
          {localityLine !== null && (
            <Text style={styles.mutedSmall} numberOfLines={1}>
              {localityLine}
            </Text>
          )}
          <Text style={[styles.stopStatus, done && styles.stopStatusDone]}>
            {routeStopStatusLabel(s.status)}
          </Text>
        </View>
      </View>
    );
  };

  const mapBlock =
    Platform.OS === 'web' ? (
      <View style={styles.mapPlaceholder}>
        <Text style={styles.muted}>El mapa no está disponible en web.</Text>
      </View>
    ) : (
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton
        initialRegion={{
          latitude: stopsWithCoords[0]?.latitude ?? polylineCoords[0]?.latitude ?? -34.6037,
          longitude: stopsWithCoords[0]?.longitude ?? polylineCoords[0]?.longitude ?? -58.3816,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
      >
        {polylineCoords.length >= 2 && (
          <Polyline coordinates={polylineCoords} strokeColor={routeColor} strokeWidth={4} />
        )}
        {stopsWithCoords.map((s) => {
          const isNext = nextStop !== null && s.id === nextStop.id;
          return (
            <Marker
              key={s.id}
              coordinate={{ latitude: s.latitude!, longitude: s.longitude! }}
              title={isNext ? 'Siguiente parada' : `Parada ${s.sequence}`}
              description={s.label ?? s.shipmentId?.slice(0, 8) ?? ''}
              pinColor={Platform.OS === 'ios' ? (isNext ? 'red' : 'green') : undefined}
            />
          );
        })}
      </MapView>
    );

  const canShowEta = durationSec !== null && (started || finished);

  return (
    <ScreenContainer
      scroll
      scrollViewProps={{
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        ),
      }}
    >
      {started && startedAtLabel !== null && (
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>En curso desde {startedAtLabel}</Text>
        </View>
      )}
      {finished && (
        <View style={[styles.statusChip, styles.statusChipFinished]}>
          <Text style={styles.statusChipText}>Ruta finalizada</Text>
        </View>
      )}

      {mapBlock}

      <View style={styles.actions}>
        {!started && !finished && (
          <Button
            variant="primary"
            loading={busy === 'start'}
            disabled={busy !== null}
            onPress={() => void onStartRoute()}
          >
            Iniciar ruta
          </Button>
        )}
        {started && (
          <>
            <Button
              variant="primary"
              loading={busy === 'reoptimize'}
              disabled={busy !== null}
              onPress={() => void onReoptimize()}
            >
              Re-optimizar
            </Button>
            <Button
              variant="outline"
              loading={busy === 'finish'}
              disabled={busy !== null}
              onPress={onFinishRoute}
            >
              Finalizar ruta
            </Button>
          </>
        )}
        {canShowEta && (
          <Text style={styles.eta}>
            ETA aprox.: {formatDrivingDuration(durationSec!)}
            {distanceM !== null ? ` · ${(distanceM / 1000).toFixed(1)} km` : ''}
          </Text>
        )}
        {actionError != null && <Text style={styles.errorText}>{actionError}</Text>}
        {nextStop !== null && nextStop.latitude !== null && nextStop.longitude !== null && started && (
          <Button variant="outline" onPress={openGoogleMapsNext}>
            Abrir siguiente en Google Maps
          </Button>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Paradas</Text>
        <Text style={styles.muted}>
          {doneStops.length} de {route.stops.length} con novedad
        </Text>
      </View>

      {activeStops.length === 0 ? (
        <Text style={styles.allDone}>
          Todas las paradas de esta ruta ya tienen novedad.
        </Text>
      ) : (
        activeStops.map((s) => renderStop(s, nextStop !== null && s.id === nextStop.id))
      )}

      {doneStops.length > 0 && (
        <>
          <Pressable
            onPress={() => setShowDone((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            style={styles.doneToggle}
          >
            <Text style={styles.doneToggleText}>
              {showDone ? 'Ocultar' : 'Ver'} paradas cerradas ({doneStops.length})
            </Text>
          </Pressable>
          {showDone && doneStops.map((s) => renderStop(s, false))}
        </>
      )}
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    map: {
      width: '100%',
      height: 260,
      borderRadius: spacing.radiusLg,
      overflow: 'hidden',
      marginBottom: spacing.md,
    },
    mapPlaceholder: {
      width: '100%',
      height: 260,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    actions: {
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    eta: {
      ...typography.caption,
      color: colors.text,
      textAlign: 'center',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    allDone: {
      ...typography.body,
      color: colors.muted,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
    doneToggle: {
      alignSelf: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    doneToggleText: {
      ...typography.caption,
      color: colors.primary,
    },
    muted: {
      ...typography.caption,
      color: colors.muted,
    },
    mutedSmall: {
      ...typography.caption,
      color: colors.muted,
      fontSize: 11,
      marginTop: 2,
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
      textAlign: 'center',
    },
    statusChip: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: spacing.radiusMd,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      marginBottom: spacing.sm,
    },
    statusChipFinished: {
      borderColor: colors.muted,
    },
    statusChipText: {
      ...typography.caption,
      color: colors.text,
    },
    stopRow: {
      flexDirection: 'row',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    stopRowNext: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    stopRowDone: {
      opacity: 0.6,
    },
    stopSeq: {
      ...typography.bodyStrong,
      color: colors.primary,
      width: 28,
      marginRight: spacing.sm,
    },
    stopSeqDone: {
      color: colors.muted,
    },
    stopStatus: {
      ...typography.caption,
      color: colors.primary,
      marginTop: 2,
    },
    stopStatusDone: {
      color: colors.muted,
    },
    stopBody: {
      flex: 1,
    },
    stopTitle: {
      ...typography.bodyStrong,
      color: colors.text,
    },
  });
}
