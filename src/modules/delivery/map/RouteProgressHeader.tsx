import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

import { ON_PRIMARY_CONTROL_BG, ON_PRIMARY_INK } from './onPrimaryInk';

type Props = {
  visited: number;
  total: number;
  /** Espacio de la barra de estado: el banner arranca pegado al borde superior. */
  insetTop: number;
  /** `null` cuando no queda ninguna parada abierta con coordenadas. */
  openMapsLabel: string | null;
  onPressOpenMaps: () => void;
  onPressRefresh: () => void;
  refreshing: boolean;
};

/**
 * La franja de arriba: cuánto llevás y el acceso directo a Google Maps.
 *
 * Es lo primero que se lee al abrir la app, así que dice el número y nada más.
 * El resto —estado de la ruta, acciones— vive abajo, donde se decide, no acá.
 */
export function RouteProgressHeader({
  visited,
  total,
  insetTop,
  openMapsLabel,
  onPressOpenMaps,
  onPressRefresh,
  refreshing,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const allDone = total > 0 && visited >= total;
  const title =
    total === 0
      ? 'Sin paradas asignadas'
      : `${visited} de ${total} ${total === 1 ? 'parada visitada' : 'paradas visitadas'}`;

  return (
    <View style={[styles.banner, { paddingTop: insetTop + theme.spacing.sm }]}>
      <View style={styles.row}>
        <View style={styles.textColumn}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {openMapsLabel !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={openMapsLabel}
              onPress={onPressOpenMaps}
              hitSlop={8}
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            >
              <Text style={styles.link} numberOfLines={1}>
                {openMapsLabel}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={ON_PRIMARY_INK} />
            </Pressable>
          ) : (
            <Text style={styles.subtle} numberOfLines={1}>
              {allDone ? 'Terminaste el reparto de hoy' : 'Sin destinos geolocalizados'}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizar paradas"
          accessibilityState={{ disabled: refreshing }}
          disabled={refreshing}
          onPress={onPressRefresh}
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={ON_PRIMARY_INK} />
          ) : (
            <Ionicons name="refresh" size={22} color={ON_PRIMARY_INK} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    banner: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    textColumn: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      ...typography.subtitle,
      fontSize: 19,
      fontWeight: '700',
      color: ON_PRIMARY_INK,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginTop: 2,
      alignSelf: 'flex-start',
    },
    link: {
      ...typography.body,
      color: ON_PRIMARY_INK,
    },
    subtle: {
      ...typography.caption,
      color: ON_PRIMARY_INK,
      opacity: 0.85,
      marginTop: 2,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ON_PRIMARY_CONTROL_BG,
    },
    pressed: {
      opacity: motion.pressOpacityStrong,
    },
  });
}
