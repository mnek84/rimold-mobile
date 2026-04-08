import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline } from 'react-native-maps';

import type { ShipmentNavigationStop } from '@core/api/shipments';
import { decodeEncodedPolyline } from '@core/geo/decodePolyline';
import { isValidLatLng } from '@core/geo/coordinates';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

type Props = {
  stops: ShipmentNavigationStop[];
  encodedPolyline: string | null;
  loading: boolean;
  error: string | null;
  /** Shown when not loading, no error, and there is nothing to draw yet */
  emptyHint?: string;
};

const FALLBACK_REGION = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const DEFAULT_EMPTY_HINT = 'Tocá «Actualizar mapa» para cargar la ruta del envío.';
const NO_COORDS_HINT = 'No hay coordenadas válidas para mostrar en el mapa.';

export function DeliveryMap({ stops, encodedPolyline, loading, error, emptyHint = DEFAULT_EMPTY_HINT }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createMapStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);

  const pathCoords = useMemo(() => {
    if (encodedPolyline == null || encodedPolyline.length === 0) {
      return [];
    }
    return decodeEncodedPolyline(encodedPolyline);
  }, [encodedPolyline]);

  const stopsWithCoords = useMemo(
    () => stops.filter((s) => isValidLatLng(s.latitude, s.longitude)),
    [stops],
  );

  const nextStop = stopsWithCoords.find((s) => s.is_next);
  const routeColor = theme.colors.success;
  const stopsMissingCoords = stops.length > 0 && stopsWithCoords.length === 0;

  useEffect(() => {
    const coords = [
      ...stopsWithCoords.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
      ...pathCoords,
    ];
    if (coords.length === 0 || mapRef.current == null) {
      return;
    }
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [stopsWithCoords, pathCoords]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>El mapa no está disponible en web.</Text>
      </View>
    );
  }

  if (error != null && error !== '') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={routeColor} />
        <Text style={styles.hint}>Cargando mapa…</Text>
      </View>
    );
  }

  if (stopsWithCoords.length === 0 && pathCoords.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{stopsMissingCoords ? NO_COORDS_HINT : emptyHint}</Text>
      </View>
    );
  }

  const initial =
    nextStop != null
      ? {
          latitude: nextStop.latitude,
          longitude: nextStop.longitude,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }
      : stopsWithCoords[0] != null
        ? {
            latitude: stopsWithCoords[0].latitude,
            longitude: stopsWithCoords[0].longitude,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          }
        : pathCoords[0] != null
          ? {
              latitude: pathCoords[0].latitude,
              longitude: pathCoords[0].longitude,
              latitudeDelta: 0.06,
              longitudeDelta: 0.06,
            }
          : FALLBACK_REGION;

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={initial}
      showsUserLocation
      showsMyLocationButton
    >
      {pathCoords.length >= 2 && (
        <Polyline coordinates={pathCoords} strokeColor={routeColor} strokeWidth={4} />
      )}
      {nextStop != null && (
        <Circle
          center={{ latitude: nextStop.latitude, longitude: nextStop.longitude }}
          radius={100}
          strokeColor={`${routeColor}d9`}
          fillColor={`${routeColor}26`}
        />
      )}
      {stopsWithCoords.map((s) => (
        <Marker
          key={s.shipment_id + String(s.sequence)}
          coordinate={{ latitude: s.latitude, longitude: s.longitude }}
          title={s.is_next ? 'Siguiente parada' : `Parada ${s.sequence}`}
          description={s.label ?? s.shipment_id.slice(0, 8)}
          pinColor={
            Platform.OS === 'ios'
              ? s.is_next
                ? 'red'
                : 'green'
              : (s.is_next ? theme.colors.primary : theme.colors.muted)
          }
        />
      ))}
    </MapView>
  );
}

function createMapStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    map: {
      width: '100%',
      height: 240,
      borderRadius: spacing.radiusLg,
      overflow: 'hidden',
    },
    placeholder: {
      height: 240,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: borderSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    placeholderText: {
      color: colors.muted,
      ...typography.caption,
      textAlign: 'center',
    },
    errorText: {
      color: colors.danger,
      ...typography.caption,
      textAlign: 'center',
    },
    hint: {
      color: colors.muted,
      ...typography.caption,
      marginTop: spacing.sm,
    },
  });
}
