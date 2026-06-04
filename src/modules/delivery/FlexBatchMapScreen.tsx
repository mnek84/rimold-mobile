import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { ScreenContainer } from '@components/ui';
import {
  fetchFlexBatch,
  suggestFlexRoute,
  type FlexBatchView,
  type FlexRouteSuggestion,
  type FlexShipmentView,
} from '@core/api/flexBatches';
import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { decodeOsrmPolyline } from '@core/geo/decodeOsrmPolyline';
import { isValidLatLng } from '@core/geo/coordinates';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';
import { useTheme, type AppTheme } from '@theme';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'FlexBatchMap'>;

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

export function FlexBatchMapScreen({ route }: Props) {
  const { batchId } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);

  const [batch, setBatch] = useState<FlexBatchView | null>(null);
  const [suggestion, setSuggestion] = useState<FlexRouteSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const b = await fetchFlexBatch(batchId);
      setBatch(b);
    } catch (e) {
      setBatch(null);
      setSuggestion(null);
      setError(messageForShipmentListError(e));
      setLoading(false);
      return;
    }
    setLoading(false);

    setSuggesting(true);
    try {
      const sug = await suggestFlexRoute(batchId);
      setSuggestion(sug);
      setError(null);
    } catch (e) {
      setSuggestion(null);
      setError(messageForShipmentListError(e));
    } finally {
      setSuggesting(false);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shipmentsWithCoords = useMemo(() => {
    if (batch === null) {
      return [];
    }
    return batch.shipments.filter(
      (s) => s.latitude !== null && s.longitude !== null && isValidLatLng(s.latitude, s.longitude),
    );
  }, [batch]);

  const polylineCoords = useMemo(() => {
    if (suggestion === null || suggestion.polyline.length === 0) {
      return [];
    }
    return decodeOsrmPolyline(suggestion.polyline);
  }, [suggestion]);

  useEffect(() => {
    const coords = [
      ...shipmentsWithCoords.map((s) => ({ latitude: s.latitude!, longitude: s.longitude! })),
      ...polylineCoords,
    ];
    if (coords.length === 0 || mapRef.current == null) {
      return;
    }
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [shipmentsWithCoords, polylineCoords]);

  const suggestedLabels = useMemo(() => {
    if (batch === null || suggestion === null) {
      return [];
    }
    const byId = new Map(batch.shipments.map((s) => [s.id, s]));
    return suggestion.optimized_order.map((id, i) => {
      const s = byId.get(id);
      return { id, rank: i + 1, tracking: s?.tracking ?? id.slice(0, 8) };
    });
  }, [batch, suggestion]);

  const routeColor = theme.colors.primary;

  const mapBlock =
    Platform.OS === 'web' ? (
      <View style={styles.mapPlaceholder}>
        <Text style={styles.muted}>El mapa no está disponible en web.</Text>
      </View>
    ) : loading && batch === null ? (
      <View style={styles.mapPlaceholder}>
        <ActivityIndicator color={routeColor} />
        <Text style={styles.hint}>Cargando envíos…</Text>
      </View>
    ) : error != null && batch === null ? (
      <View style={styles.mapPlaceholder}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    ) : (
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation
        showsMyLocationButton
        initialRegion={{
          latitude: shipmentsWithCoords[0]?.latitude ?? polylineCoords[0]?.latitude ?? -34.6037,
          longitude: shipmentsWithCoords[0]?.longitude ?? polylineCoords[0]?.longitude ?? -58.3816,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {polylineCoords.length >= 2 && (
          <Polyline coordinates={polylineCoords} strokeColor={routeColor} strokeWidth={4} />
        )}
        {shipmentsWithCoords.map((s) => {
          const selected = s.id === selectedId;
          return (
            <Marker
              key={s.id}
              coordinate={{ latitude: s.latitude!, longitude: s.longitude! }}
              title={s.tracking}
              description={selected ? 'Seleccionado' : 'Tocá la lista para destacar'}
              pinColor={Platform.OS === 'ios' ? (selected ? 'red' : 'green') : undefined}
            />
          );
        })}
      </MapView>
    );

  return (
    <ScreenContainer scroll>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Orden sugerido</Text>
        <Text style={styles.bannerHint}>Solo referencia — podés entregar en el orden que prefieras.</Text>
        {suggesting && (
          <Text style={styles.muted}>Calculando ruta sugerida…</Text>
        )}
        {suggestion !== null && (
          <Text style={styles.eta}>
            ETA sugerida: {formatDrivingDuration(suggestion.duration)}
            {suggestion.distance > 0 ? ` · ${(suggestion.distance / 1000).toFixed(1)} km` : ''}
          </Text>
        )}
      </View>

      {mapBlock}

      {error != null && batch !== null && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.sectionTitle}>Sugerencia (orden de visita)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
        {suggestedLabels.map(({ id, rank, tracking }) => (
          <View key={id} style={styles.chip}>
            <Text style={styles.chipRank}>{rank}</Text>
            <Text style={styles.chipText} numberOfLines={1}>
              {tracking}
            </Text>
          </View>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Envíos (selección manual)</Text>
      {batch?.shipments.map((s) => (
        <ShipmentSelectRow
          key={s.id}
          shipment={s}
          selected={s.id === selectedId}
          onPress={() => setSelectedId(s.id === selectedId ? null : s.id)}
          styles={styles}
        />
      ))}
    </ScreenContainer>
  );
}

function ShipmentSelectRow({
  shipment,
  selected,
  onPress,
  styles,
}: {
  shipment: FlexShipmentView;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const hasCoords =
    shipment.latitude !== null && shipment.longitude !== null && isValidLatLng(shipment.latitude, shipment.longitude);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.shipRow,
        selected && styles.shipRowSelected,
        pressed && styles.shipRowPressed,
        !hasCoords && styles.shipRowDisabled,
      ]}
      disabled={!hasCoords}
    >
      <Text style={styles.shipTracking}>{shipment.tracking}</Text>
      <Text style={styles.muted} numberOfLines={2}>
        {shipment.label ?? (hasCoords ? 'Tocá para ver en el mapa' : 'Sin coordenadas en destino')}
      </Text>
    </Pressable>
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
      padding: spacing.md,
    },
    banner: {
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bannerTitle: {
      ...typography.bodyStrong,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    bannerHint: {
      ...typography.caption,
      color: colors.muted,
      marginBottom: spacing.sm,
    },
    eta: {
      ...typography.caption,
      color: colors.text,
    },
    hint: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.sm,
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.text,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    chipsRow: {
      marginBottom: spacing.md,
      maxHeight: 44,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.sm,
    },
    chipRank: {
      ...typography.captionStrong,
      color: colors.primary,
      marginRight: spacing.sm,
    },
    chipText: {
      ...typography.caption,
      color: colors.text,
      maxWidth: 140,
    },
    muted: {
      ...typography.caption,
      color: colors.muted,
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
      marginBottom: spacing.sm,
    },
    shipRow: {
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    shipRowSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    shipRowPressed: {
      opacity: 0.85,
    },
    shipRowDisabled: {
      opacity: 0.5,
    },
    shipTracking: {
      ...typography.bodyStrong,
      color: colors.text,
      marginBottom: 2,
    },
  });
}
