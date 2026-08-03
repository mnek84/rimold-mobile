import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button, ScreenContainer } from '@components/ui';
import { optimizeRoute, type DriverRouteView, type RouteStopView } from '@core/api/routes';
import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { isValidLatLng } from '@core/geo/coordinates';
import { decodeOsrmPolyline } from '@core/geo/decodeOsrmPolyline';
import { useTheme, type AppTheme } from '@theme';

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

export function InternalRouteContent({ route, onRefresh }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);

  const [polylineCoords, setPolylineCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Reset optimization state when the route identity or its stop count changes
  // (e.g. new shipments were appended as stops after a sync).
  useEffect(() => {
    setStarted(false);
    setPolylineCoords([]);
    setDurationSec(null);
    setDistanceM(null);
    setOptimizeError(null);
  }, [route.id, route.stops.length]);

  const stopsWithCoords = useMemo(() => {
    return route.stops.filter(
      (s) => s.latitude !== null && s.longitude !== null && isValidLatLng(s.latitude, s.longitude),
    );
  }, [route.stops]);

  const nextStop: RouteStopView | null = useMemo(() => {
    return route.stops.find((s) => s.status === 'pending') ?? null;
  }, [route.stops]);

  const onStartRoute = useCallback(async () => {
    setOptimizing(true);
    setOptimizeError(null);
    try {
      const res = await optimizeRoute(route.id);
      setPolylineCoords(decodeOsrmPolyline(res.polyline));
      setDurationSec(res.duration);
      setDistanceM(res.distance);
      setStarted(true);
    } catch (e) {
      setOptimizeError(messageForShipmentListError(e));
    } finally {
      setOptimizing(false);
    }
  }, [route.id]);

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
      {mapBlock}

      <View style={styles.actions}>
        <Button
          variant="primary"
          loading={optimizing}
          disabled={optimizing}
          onPress={() => void onStartRoute()}
        >
          Iniciar ruta
        </Button>
        {started && durationSec !== null && (
          <Text style={styles.eta}>
            ETA aprox.: {formatDrivingDuration(durationSec)}
            {distanceM !== null ? ` · ${(distanceM / 1000).toFixed(1)} km` : ''}
          </Text>
        )}
        {optimizeError != null && <Text style={styles.errorText}>{optimizeError}</Text>}
        {nextStop !== null && nextStop.latitude !== null && nextStop.longitude !== null && started && (
          <Button variant="outline" onPress={openGoogleMapsNext}>
            Abrir siguiente en Google Maps
          </Button>
        )}
      </View>

      <Text style={styles.sectionTitle}>Paradas</Text>
      {route.stops.map((s) => {
        const isNext = nextStop !== null && s.id === nextStop.id;
        return (
          <View key={s.id} style={[styles.stopRow, isNext && styles.stopRowNext]}>
            <Text style={styles.stopSeq}>{s.sequence}</Text>
            <View style={styles.stopBody}>
              <Text style={styles.stopTitle}>
                {isNext ? 'Siguiente · ' : ''}Parada {s.sequence}
                {s.shipmentId != null ? ` · ${s.shipmentId.slice(0, 8)}` : ''}
              </Text>
              <Text style={styles.muted} numberOfLines={2}>
                {s.label ?? '—'}
              </Text>
              <Text style={styles.mutedSmall}>{s.status}</Text>
            </View>
          </View>
        );
      })}
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
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.text,
      marginBottom: spacing.sm,
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
    stopSeq: {
      ...typography.bodyStrong,
      color: colors.primary,
      width: 28,
      marginRight: spacing.sm,
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
