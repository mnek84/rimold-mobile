import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
  const contentKey = `${kind}|${stop.addressTypeCode}|${selected ? 's' : 'u'}|${theme.scheme}`;
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
      </View>
    </Marker>
  );
}

export const StopMarker = memo(StopMarkerComponent);

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    pin: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 4,
    },
    pinSelected: {
      borderWidth: 3.5,
      borderColor: t.colors.text,
    },
  });
}
