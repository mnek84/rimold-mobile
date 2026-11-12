import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

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
  const ink = theme.colors.chromeOn;

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
              <Ionicons name="chevron-forward" size={16} color={ink} />
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
            <ActivityIndicator size="small" color={ink} />
          ) : (
            <Ionicons name="refresh" size={22} color={ink} />
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
      backgroundColor: colors.chrome,
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
      fontWeight: '700',
      color: colors.chromeOn,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      marginTop: spacing.xxs,
      alignSelf: 'flex-start',
      minHeight: 32,
    },
    link: {
      ...typography.bodyStrong,
      color: colors.chromeOn,
      textDecorationLine: 'underline',
    },
    subtle: {
      ...typography.caption,
      color: colors.chromeOn,
      marginTop: spacing.xxs,
    },
    iconButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.chromeControl,
    },
    pressed: {
      opacity: motion.pressOpacityStrong,
    },
  });
}
