import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  dispatchDriverDay,
  optimizeRoute,
  type DispatchDayResult,
  type DriverDayTotals,
  type DriverRouteView,
  type RouteStopView,
} from '@core/api/routes';
import { createEventUuid } from '@core/sync';
import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { showToast } from '@core/feedback/toastStore';
import { decodeOsrmPolyline } from '@core/geo/decodeOsrmPolyline';
import { Button } from '@components/ui';
import type { MainTabNav } from '@navigation/types';
import { useTheme, type AppTheme } from '@theme';

import { WorkdayFinishSheet } from './components/WorkdayFinishSheet';
import {
  navigableStopCount,
  openRouteInGoogleMaps,
  openTurnByTurnNavigation,
} from './map/externalNavigation';
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
  /** Hay ruta interna (propios). Sin ella no hay qué optimizar ni finalizar. */
  hasInternalRoute?: boolean;
  /** Totales de la vista unificada (null con un backend viejo). */
  totals?: DriverDayTotals | null;
};

/** Resumen legible de "Poner todos en camino": incluidos y excluidos CON motivo. */
function dispatchSummaryText(res: DispatchDayResult): string {
  const lines: string[] = [];
  const own = res.included.filter((r) => r.outcome === 'dispatched' || r.outcome === 'already_out_for_delivery').length;
  const flex = res.included.filter((r) => r.reasonCode === 'flex_status_managed_by_ml').length;
  lines.push(`En camino: ${own} propios.`);
  if (flex > 0) {
    lines.push(`Flex en tu recorrido: ${flex} (su estado lo informa Mercado Libre, no se modificó).`);
  }
  if (res.excluded.length > 0) {
    lines.push('');
    lines.push(`No salieron (${res.excluded.length}):`);
    for (const r of res.excluded.slice(0, 8)) {
      lines.push(`• ${r.tracking ?? r.shipmentId}: ${r.reasonLabel ?? r.reasonCode ?? 'sin motivo'}`);
    }
    if (res.excluded.length > 8) lines.push(`… y ${res.excluded.length - 8} más.`);
  }
  if (res.replayed) {
    lines.push('');
    lines.push('(Ya se había procesado: no se repitió nada.)');
  }
  return lines.join('\n');
}

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

/**
 * El reparto del día en un mapa a pantalla completa.
 *
 * Todas las paradas se dibujan siempre, cerradas incluidas: el tilde verde
 * sobre lo entregado es la mitad de la información: dice cuánto falta y, sobre
 * todo, por dónde ya se pasó. Esconder lo hecho —como hacía la versión en
 * lista— obligaba a reconstruir de memoria el recorrido recién hecho.
 */
export function InternalRouteContent({ route, onRefresh, hasInternalRoute = true, totals = null }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<MainTabNav<'RutaMapa'>>();
  const mapRef = useRef<MapView>(null);

  // Sin ruta interna (sólo Flex) no hay "iniciada": se recuerda localmente que
  // el chofer ya despachó, para no seguir ofreciéndole el botón.
  const [dispatchedLocally, setDispatchedLocally] = useState(false);
  const started = (route.startedAt !== null && route.finishedAt === null) || (!hasInternalRoute && dispatchedLocally);
  const finished = route.finishedAt !== null;
  // Misma key en los reintentos de UN toque (timeout, 409): el servidor
  // devuelve el resumen guardado en vez de procesar dos veces.
  const dispatchKey = useRef<string | null>(null);

  const [polylineCoords, setPolylineCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [busy, setBusy] = useState<RouteBusyAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

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

  /**
   * "Poner todos en camino" (POST /driver/dispatch). Propios a reparto; los
   * Flex sólo quedan marcados en el recorrido (su estado es de ML).
   *
   * La optimización es best-effort: antes, si UNA parada no tenía coordenadas
   * el optimize fallaba y no se podía iniciar la ruta en absoluto.
   */
  const onStartRoute = useCallback(async () => {
    setBusy('start');
    setActionError(null);
    if (hasInternalRoute && route.id !== '') {
      try {
        applyOptimizeResult(await optimizeRoute(route.id));
      } catch {
        // Sin polilínea igual se puede salir: el mapa y la lista siguen.
      }
    }
    try {
      dispatchKey.current ??= createEventUuid();
      const res = await dispatchDriverDay(dispatchKey.current);
      dispatchKey.current = null;
      setDispatchedLocally(true);
      await onRefresh();
      setActionsOpen(false);
      Alert.alert('Poner todos en camino', dispatchSummaryText(res));
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        setActionError('Ya hay un despacho en curso. Reintentá en unos segundos.');
      } else {
        setActionError(messageForShipmentListError(e));
      }
    } finally {
      setBusy(null);
    }
  }, [route.id, hasInternalRoute, applyOptimizeResult, onRefresh]);

  const onReoptimize = useCallback(async () => {
    if (!hasInternalRoute || route.id === '') {
      setActionError('No hay ruta propia para optimizar: sólo tenés envíos Flex.');
      return;
    }
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
  }, [route.id, hasInternalRoute, applyOptimizeResult]);

  /**
   * "Finalizar jornada": propios con las reglas de la ruta interna, Flex
   * explicados (se cierran en Mercado Libre). Antes era "Finalizar ruta" y un
   * chofer con sólo Flex recibía "No hay ruta propia para finalizar".
   */
  const openFinishWorkday = useCallback(() => {
    setActionsOpen(false);
    setFinishOpen(true);
  }, []);

  const unlocatableCount = useMemo(
    () => route.stops.filter((s) => !hasCoordinates(s)).length,
    [route.stops],
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

      {/*
        Nada desaparece en silencio: si hay envíos que no se pueden dibujar
        (sin coordenadas, (0,0), fuera de zona, ejes invertidos) se dice
        cuántos y la lista los muestra con el motivo.
      */}
      {unlocatableCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${unlocatableCount} envíos sin ubicación en el mapa. Ver lista.`}
          onPress={() => setListOpen(true)}
          style={[styles.unlocatableBanner, { top: insets.top + 96 }]}
        >
          <Ionicons name="warning-outline" size={16} color={theme.colors.warningOn} />
          <Text style={styles.unlocatableBannerText} numberOfLines={2}>
            {unlocatableCount === 1
              ? '1 envío sin ubicación válida: no está en el mapa. Ver lista.'
              : `${unlocatableCount} envíos sin ubicación válida: no están en el mapa. Ver lista.`}
          </Text>
        </Pressable>
      ) : null}

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
          <Ionicons name="list" size={24} color={theme.colors.primaryOn} />
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
          onPressShipment={(id) => openShipmentDetail(id)}
          onClose={() => setSelectedStopId(null)}
          insetBottom={insets.bottom}
        />
      ) : !started && !finished ? (
        <View style={[styles.startBar, { paddingBottom: theme.spacing.md + insets.bottom }]}>
          <Button
            variant="primary"
            size="lg"
            icon="play"
            accessibilityLabel="Iniciar ruta"
            disabled={busy !== null}
            onPress={() => void onStartRoute()}
          >
            {busy === 'start' ? 'Despachando…' : 'Poner todos en camino'}
          </Button>
          <Text style={styles.startHint}>
            {totals !== null
              ? `Saca a reparto tus envíos propios. Los ${totals.byOperator.mercadolibre_flex ?? 0} Flex quedan en el recorrido con el estado que informe Mercado Libre.`
              : `Saca a reparto los ${route.stops.length} envíos de la ruta.`}
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
            <Ionicons name="navigate" size={22} color={theme.colors.primary} />
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
        onFinish={openFinishWorkday}
        insetBottom={insets.bottom}
      />

      <WorkdayFinishSheet
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        onFinished={() => void onRefresh()}
        insetBottom={insets.bottom}
      />
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion, touch } = t;
  // Floating controls over the map keep a neutral shadow; never a coloured glow.
  const floatShadow = (opacity: number, radius: number, offsetY: number, androidElevation: number) =>
    Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOpacity: opacity,
        shadowRadius: radius,
        shadowOffset: { width: 0, height: offsetY },
      },
      android: { elevation: androidElevation },
      default: {},
    });
  return StyleSheet.create({
    unlocatableBanner: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      zIndex: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: touch.min,
      borderRadius: spacing.radiusXl,
      backgroundColor: colors.warning,
    },
    unlocatableBannerText: {
      ...typography.captionStrong,
      color: colors.warningOn,
      flex: 1,
    },
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    webPlaceholder: {
      ...StyleSheet.absoluteFill,
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
      width: touch.min,
      height: touch.min,
      borderRadius: spacing.radiusPill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...floatShadow(0.2, 6, 2, 5),
    },
    fabPrimary: {
      width: touch.primary,
      height: touch.primary,
      borderRadius: spacing.radiusPill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      ...floatShadow(0.25, 8, 3, 8),
    },
    startBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      backgroundColor: colors.surface,
      borderTopLeftRadius: spacing.radiusCard,
      borderTopRightRadius: spacing.radiusCard,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...floatShadow(0.22, 16, -4, 16),
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
      minHeight: touch.primary,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
      ...floatShadow(0.18, 10, 2, 6),
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
