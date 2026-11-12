import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { RouteStopView } from '@core/api/routes';
import { useTheme, type AppTheme } from '@theme';

import { stopVisualKind, stopVisualStyle, type StopVisualKind } from './stopPresentation';

const BASE_SIZE = 34;
const SELECTED_SIZE = 46;

/**
 * Ventana en la que el marcador se deja re-rasterizar.
 *
 * `tracksViewChanges` en `true` hace que react-native-maps vuelva a convertir
 * la vista en bitmap en cada frame, por marcador: con 45 paradas el mapa deja
 * de responder al arrastre. En `false` desde el arranque, en cambio, Android
 * dibuja el marcador vacío porque la tipografía de íconos todavía no cargó.
 * La solución es dejarlo prendido sólo hasta que el contenido se asentó.
 */
const TRACK_WINDOW_MS = 400;

type Props = {
  stop: RouteStopView & { latitude: number; longitude: number };
  selected: boolean;
  onPress: (stopId: string) => void;
};

/** zIndex por estado: lo pendiente y lo seleccionado se dibujan encima de lo cerrado. */
function markerZIndex(kind: StopVisualKind, selected: boolean): number {
  if (selected) return 100;
  if (kind === 'active') return 60;
  if (kind === 'pending') return 40;
  return 10;
}

function StopMarkerComponent({ stop, selected, onPress }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const kind = stopVisualKind(stop);
  const visual = stopVisualStyle(theme, kind, stop.addressTypeCode);
  const size = selected ? SELECTED_SIZE : BASE_SIZE;

  // Clave de contenido: cambia sólo cuando el pin realmente se ve distinto.
  const count = stop.shipmentCount ?? 1;
  const hasFlex = stop.hasFlex === true;
  const contentKey = `${kind}|${stop.addressTypeCode}|${selected ? 's' : 'u'}|${count}|${hasFlex ? 'f' : ''}|${theme.scheme}`;
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), TRACK_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [contentKey]);

  return (
    <Marker
      identifier={stop.id}
      coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={markerZIndex(kind, selected)}
      tracksViewChanges={tracksViewChanges}
      onPress={() => onPress(stop.id)}
    >
      <View
        style={[
          styles.pin,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: visual.fill,
            borderColor: visual.ring,
          },
          selected && styles.pinSelected,
        ]}
      >
        <Ionicons name={visual.icon} size={selected ? 24 : 17} color={visual.iconColor} />
        {/*
          Dos marcas aparte en vez de otro color: el relleno ya es el estado y
          el ícono el tipo de domicilio. Arriba a la derecha, cuántos envíos
          hay en el punto; abajo a la izquierda, "F" si alguno es Flex (lo
          entrega la app de Mercado Libre).
        */}
        {count > 1 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countText} maxFontSizeMultiplier={1.3}>
              {count}
            </Text>
          </View>
        ) : null}
        {hasFlex ? (
          <View style={styles.flexBadge}>
            <Text style={styles.flexText} maxFontSizeMultiplier={1.3}>
              F
            </Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

export const StopMarker = memo(StopMarkerComponent);

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    pin: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      // Floats over the map: keeps a neutral shadow.
      shadowColor: colors.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 4,
    },
    pinSelected: {
      borderWidth: 3.5,
      borderColor: colors.mapInk,
    },
    countBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
      // 20, not 18: the `micro` line (16) has to fit inside the 1.5 border.
      minWidth: 20,
      height: 20,
      paddingHorizontal: spacing.xs,
      borderRadius: spacing.radiusPill,
      backgroundColor: colors.mapInk,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.mapMarkerRing,
    },
    countText: {
      ...typography.micro,
      fontWeight: '700',
      color: colors.mapInkOn,
    },
    flexBadge: {
      position: 'absolute',
      bottom: -6,
      left: -6,
      width: 20,
      height: 20,
      borderRadius: spacing.xs,
      backgroundColor: colors.partnerFlex,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.mapMarkerRing,
    },
    flexText: {
      ...typography.micro,
      fontWeight: '800',
      color: colors.partnerFlexOn,
    },
  });
}
