import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  finishDriverRoute,
  optimizeRoute,
  startDriverRoute,
  type DriverRouteView,
  type RouteStopView,
} from '@core/api/routes';
import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { showToast } from '@core/feedback/toastStore';
import { decodeOsrmPolyline } from '@core/geo/decodeOsrmPolyline';
import type { MainTabNav } from '@navigation/types';
import { useTheme, type AppTheme } from '@theme';

import {
  navigableStopCount,
  openRouteInGoogleMaps,
  openTurnByTurnNavigation,
} from './map/externalNavigation';
import { ON_PRIMARY_INK } from './map/onPrimaryInk';
import { RouteActionsSheet, type RouteBusyAction } from './map/RouteActionsSheet';
import { RouteProgressHeader } from './map/RouteProgressHeader';
import { StopListSheet } from './map/StopListSheet';
import { StopMarker } from './map/StopMarker';
import { StopPreviewCard } from './map/StopPreviewCard';
import {
  formatStopAddress,
  hasCoordinates,
  isVisitedKind,
  stopVisualKind,
} from './map/stopPresentation';

type Props = {
  route: DriverRouteView;
  onRefresh: () => Promise<void>;
};

/** Buenos Aires: sólo se usa si no hay ni una parada ni posición del equipo. */
const FALLBACK_REGION = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const FIT_PADDING = { top: 190, right: 64, bottom: 320, left: 64 };

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

/**
 * El reparto del día en un mapa a pantalla completa.
 *
 * Todas las paradas se dibujan siempre, cerradas incluidas: el tilde verde
 * sobre lo entregado es la mitad de la información: dice cuánto falta y, sobre
 * todo, por dónde ya se pasó. Esconder lo hecho —como hacía la versión en
 * lista— obligaba a reconstruir de memoria el recorrido recién hecho.
 */
export function InternalRouteContent({ route, onRefresh }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<MainTabNav<'RutaMapa'>>();
  const mapRef = useRef<MapView>(null);

  const started = route.startedAt !== null && route.finishedAt === null;
  const finished = route.finishedAt !== null;

  const [polylineCoords, setPolylineCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [busy, setBusy] = useState<RouteBusyAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  // El cache visual (polilínea / ETA) pertenece a una ruta concreta. Agregar
  // paradas a la misma ruta no lo invalida: el estado start/finish lo lleva el
  // servidor, no esta pantalla.
  useEffect(() => {
    setPolylineCoords([]);
    setDurationSec(null);
    setDistanceM(null);
    setActionError(null);
  }, [route.id]);

  // Aviso cuando entran paradas nuevas con la ruta ya en curso.
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

  const stopsWithCoords = useMemo(() => route.stops.filter(hasCoordinates), [route.stops]);

  const pendingStops = useMemo(
    () => route.stops.filter((s) => !isVisitedKind(stopVisualKind(s))),
    [route.stops],
  );

  const visitedCount = route.stops.length - pendingStops.length;

  /** Primera parada abierta por secuencia: la que el chofer está haciendo ahora. */
  const nextStop: RouteStopView | null = pendingStops[0] ?? null;

  const selectedStop = useMemo(
    () => route.stops.find((s) => s.id === selectedStopId) ?? null,
    [route.stops, selectedStopId],
  );

  const pendingWithCoords = useMemo(() => pendingStops.filter(hasCoordinates), [pendingStops]);

  // Encuadre inicial: una vez por ruta y por cambio en la cantidad de paradas
  // dibujables. Re-encuadrar en cada recarga le movía el mapa bajo el dedo al
  // chofer que acababa de hacer zoom sobre su manzana.
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    // La polilínea entra en la clave porque llega después del primer encuadre:
    // sin eso, el recorrido recién optimizado quedaba medio fuera de pantalla.
    const key = `${route.id}:${stopsWithCoords.length}:${polylineCoords.length > 0 ? 'p' : 'n'}`;
    if (fittedKey.current === key || mapRef.current === null) {
      return;
    }
    const coords = [
      ...stopsWithCoords.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
      ...polylineCoords,
    ];
    if (coords.length === 0) {
      return;
    }
    fittedKey.current = key;
    mapRef.current.fitToCoordinates(coords, { edgePadding: FIT_PADDING, animated: true });
  }, [route.id, stopsWithCoords, polylineCoords]);

  // Con la ruta ya en curso, la parada siguiente viene elegida: la ficha de
  // abajo contesta "¿a dónde voy ahora?" sin pedir un toque. Antes de iniciar
  // no se auto-elige nada, porque ahí el lugar de abajo lo ocupa "Iniciar ruta",
  // que es lo único que hay para hacer.
  const autoSelectedForRoute = useRef<string | null>(null);
  useEffect(() => {
    if (!started || autoSelectedForRoute.current === route.id || nextStop === null) {
      return;
    }
    autoSelectedForRoute.current = route.id;
    setSelectedStopId(nextStop.id);
  }, [route.id, nextStop, started]);

  const focusStop = useCallback(
    (stopId: string) => {
      setSelectedStopId(stopId);
      const stop = route.stops.find((s) => s.id === stopId);
      if (stop === undefined || !hasCoordinates(stop) || mapRef.current === null) {
        return;
      }
      mapRef.current.animateCamera(
        { center: { latitude: stop.latitude, longitude: stop.longitude } },
        { duration: 350 },
      );
    },
    [route.stops],
  );

  const navigateToStop = useCallback(
    (stopId: string) => {
      const stop = route.stops.find((s) => s.id === stopId);
      if (stop === undefined || !hasCoordinates(stop)) {
        return;
      }
      void openTurnByTurnNavigation({ latitude: stop.latitude, longitude: stop.longitude });
    },
    [route.stops],
  );

  const openShipmentDetail = useCallback(
    (shipmentId: string | null) => {
      if (shipmentId === null) {
        showToast('Esta parada no tiene un envío asociado.');
        return;
      }
      navigation.navigate('Entregas', {
        screen: 'DeliveryDetail',
        params: { shipmentId },
      });
    },
    [navigation],
  );

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
      setActionsOpen(false);
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
      setActionsOpen(false);
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
        setActionsOpen(false);
      } catch (e) {
        const pending = pendingStopsCountFrom(e);
        if (pending !== null) {
          // El texto nombra la consecuencia, no sólo la cantidad: finalizar
          // registra esas paradas como entregas fallidas y manda los paquetes a
          // la cola de reingreso del depósito. Es la acción menos reversible de
          // la jornada y antes se confirmaba con un "¿de todos modos?".
          Alert.alert(
            'Finalizar ruta',
            pending === 1
              ? 'Queda 1 parada sin entregar. Al finalizar se registra como entrega fallida y el paquete vuelve al depósito.'
              : `Quedan ${pending} paradas sin entregar. Al finalizar se registran como entregas fallidas y esos paquetes vuelven al depósito.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Finalizar y devolver',
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const centerOnUser = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== Location.PermissionStatus.GRANTED) {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (asked.status !== Location.PermissionStatus.GRANTED) {
          showToast('Necesitamos tu ubicación para centrarte en el mapa.');
          return;
        }
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapRef.current?.animateCamera(
        {
          center: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          zoom: 15,
        },
        { duration: 400 },
      );
    } catch {
      showToast('No pudimos leer tu ubicación.');
    }
  }, []);

  const openMapsLabel = useMemo(() => {
    const total = pendingWithCoords.length;
    if (total === 0) {
      return null;
    }
    const usable = navigableStopCount(total);
    // Nada se recorta en silencio: si el link de Google Maps no entra entero,
    // el rótulo dice cuántas de cuántas se van a abrir.
    return usable < total
      ? `Ver próximas ${usable} de ${total} en Google Maps`
      : 'Ver en Google Maps';
  }, [pendingWithCoords.length]);

  const onPressOpenMaps = useCallback(() => {
    if (pendingWithCoords.length === 0) {
      return;
    }
    void openRouteInGoogleMaps(
      pendingWithCoords.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    );
  }, [pendingWithCoords]);

  const etaLabel = useMemo(() => {
    if (durationSec === null) {
      return null;
    }
    const distance = distanceM !== null ? ` · ${(distanceM / 1000).toFixed(1)} km` : '';
    return `ETA aprox.: ${formatDrivingDuration(durationSec)}${distance}`;
  }, [durationSec, distanceM]);

  const initialRegion = useMemo(() => {
    const anchor = stopsWithCoords[0] ?? null;
    if (anchor === null) {
      return FALLBACK_REGION;
    }
    return {
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    };
  }, [stopsWithCoords]);

  const startedAtLabel = formatStartedAt(route.startedAt);

  return (
    <View style={styles.root}>
      {Platform.OS === 'web' ? (
        <View style={styles.webPlaceholder}>
          <Ionicons name="map-outline" size={48} color={theme.colors.muted} />
          <Text style={styles.webPlaceholderText}>El mapa no está disponible en web.</Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          onPress={() => setSelectedStopId(null)}
        >
          {polylineCoords.length >= 2 ? (
            <Polyline
              coordinates={polylineCoords}
              strokeColor={theme.colors.primary}
              strokeWidth={5}
            />
          ) : null}
          {stopsWithCoords.map((stop) => (
            <StopMarker
              key={stop.id}
              stop={stop}
              selected={stop.id === selectedStopId}
              onPress={focusStop}
            />
          ))}
        </MapView>
      )}

      <RouteProgressHeader
        visited={visitedCount}
        total={route.stops.length}
        insetTop={insets.top}
        openMapsLabel={openMapsLabel}
        onPressOpenMaps={onPressOpenMaps}
        onPressRefresh={() => void handleRefresh()}
        refreshing={refreshing}
      />

      <View style={styles.sideControls} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Centrar en mi ubicación"
          onPress={() => void centerOnUser()}
          style={({ pressed }) => [styles.fabLight, pressed && styles.pressed]}
        >
          <Ionicons name="locate" size={22} color={theme.colors.primary} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Acciones de la ruta"
          onPress={() => setActionsOpen(true)}
          style={({ pressed }) => [styles.fabLight, pressed && styles.pressed]}
        >
          <Ionicons
            name={finished ? 'flag-outline' : started ? 'ellipsis-horizontal' : 'play'}
            size={22}
            color={theme.colors.primary}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver la lista de ${route.stops.length} paradas`}
          onPress={() => setListOpen(true)}
          style={({ pressed }) => [styles.fabPrimary, pressed && styles.pressed]}
        >
          <Ionicons name="list" size={24} color={ON_PRIMARY_INK} />
        </Pressable>
      </View>

      {/*
        Un solo lugar abajo, con precedencia: lo que el chofer acaba de tocar
        gana siempre. Mirar una parada antes de arrancar es legítimo, y taparle
        la ficha con "Iniciar ruta" sería contestarle otra cosa de la que
        preguntó — iniciar sigue a mano en el botón lateral de acciones.
      */}
      {selectedStop !== null ? (
        <StopPreviewCard
          stop={selectedStop}
          canNavigate={hasCoordinates(selectedStop)}
          onPressNavigate={() => navigateToStop(selectedStop.id)}
          onPressDetail={() => openShipmentDetail(selectedStop.shipmentId)}
          onClose={() => setSelectedStopId(null)}
          insetBottom={insets.bottom}
        />
      ) : !started && !finished ? (
        <View style={[styles.startBar, { paddingBottom: theme.spacing.md + insets.bottom }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Iniciar ruta"
            accessibilityState={{ disabled: busy !== null }}
            disabled={busy !== null}
            onPress={() => void onStartRoute()}
            style={({ pressed }) => [
              styles.startButton,
              busy !== null && styles.startButtonBusy,
              pressed && busy === null && styles.pressed,
            ]}
          >
            <Ionicons name="play" size={18} color={ON_PRIMARY_INK} />
            <Text style={styles.startButtonLabel}>
              {busy === 'start' ? 'Iniciando…' : 'Iniciar ruta'}
            </Text>
          </Pressable>
          <Text style={styles.startHint}>
            Saca a reparto los {route.stops.length} envíos de la ruta.
          </Text>
        </View>
      ) : nextStop !== null ? (
        <View style={[styles.nextBar, { paddingBottom: theme.spacing.md + insets.bottom }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Siguiente parada: ${formatStopAddress(nextStop)}`}
            onPress={() => focusStop(nextStop.id)}
            style={({ pressed }) => [styles.nextPill, pressed && styles.pressed]}
          >
            <Ionicons name="navigate" size={16} color={theme.colors.primary} />
            <Text style={styles.nextPillText} numberOfLines={1}>
              Siguiente: {formatStopAddress(nextStop)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <StopListSheet
        visible={listOpen}
        stops={route.stops}
        selectedStopId={selectedStopId}
        onClose={() => setListOpen(false)}
        onPressStop={(stopId) => {
          setListOpen(false);
          focusStop(stopId);
        }}
        onPressNavigate={navigateToStop}
        insetTop={insets.top}
        insetBottom={insets.bottom}
      />

      <RouteActionsSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        started={started}
        finished={finished}
        startedAtLabel={startedAtLabel}
        busy={busy}
        etaLabel={etaLabel}
        error={actionError}
        onStart={() => void onStartRoute()}
        onReoptimize={() => void onReoptimize()}
        onFinish={() => void finishNow(false)}
        insetBottom={insets.bottom}
      />
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    webPlaceholder: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      backgroundColor: colors.surfaceMuted,
    },
    webPlaceholderText: {
      ...typography.body,
      color: colors.muted,
    },
    sideControls: {
      position: 'absolute',
      right: spacing.lg,
      bottom: 180,
      gap: spacing.sm,
      alignItems: 'flex-end',
    },
    fabLight: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        },
        android: { elevation: 5 },
        default: {},
      }),
    },
    fabPrimary: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOpacity: 0.45,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        },
        android: { elevation: 8 },
        default: {},
      }),
    },
    startBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      backgroundColor: colors.surface,
      borderTopLeftRadius: spacing.radiusCard + 6,
      borderTopRightRadius: spacing.radiusCard + 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
        },
        android: { elevation: 16 },
        default: {},
      }),
    },
    startButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 54,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.primary,
    },
    startButtonBusy: {
      opacity: 0.7,
    },
    startButtonLabel: {
      ...typography.bodyStrong,
      fontSize: 17,
      color: ON_PRIMARY_INK,
    },
    startHint: {
      ...typography.caption,
      color: colors.muted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    nextBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    nextPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 48,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
        },
        android: { elevation: 6 },
        default: {},
      }),
    },
    nextPillText: {
      ...typography.bodyStrong,
      color: colors.text,
      flex: 1,
      minWidth: 0,
    },
    pressed: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
  });
}
