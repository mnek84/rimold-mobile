import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RouteStopView } from '@core/api/routes';
import { useTheme, type AppTheme } from '@theme';

import { ON_PRIMARY_INK } from './onPrimaryInk';
import {
  addressTypeLabel,
  formatStopAddress,
  formatStopLocality,
  stopStatusLabel,
  stopVisualKind,
  stopVisualStyle,
  type StopVisualKind,
} from './stopPresentation';

type Props = {
  stop: RouteStopView;
  /** `false` cuando el destino no tiene coordenadas: no hay a dónde navegar. */
  canNavigate: boolean;
  onPressNavigate: () => void;
  onPressDetail: () => void;
  onClose: () => void;
  /** Alto de la barra de gestos del sistema. */
  insetBottom: number;
};

function statusColor(t: AppTheme, kind: StopVisualKind): string {
  switch (kind) {
    case 'done':
      return t.colors.success;
    case 'failed':
      return t.colors.danger;
    case 'skipped':
      return t.colors.muted;
    case 'active':
      return t.colors.primary;
    default:
      return t.colors.muted;
  }
}

/**
 * La ficha que sube al tocar una chincheta: dirección, estado y "Ir".
 *
 * Es la pantalla completa de la parada reducida a lo que se decide con el auto
 * en marcha. Todo lo demás (timeline, acciones de entrega, fotos) queda a un
 * toque de distancia, en el detalle del envío.
 */
export function StopPreviewCard({
  stop,
  canNavigate,
  onPressNavigate,
  onPressDetail,
  onClose,
  insetBottom,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const kind = stopVisualKind(stop);
  const visual = stopVisualStyle(theme, kind, stop.addressTypeCode);
  const locality = formatStopLocality(stop);
  const typeLabel = addressTypeLabel(stop.addressTypeCode);
  const tracking = stop.tracking;

  return (
    <View style={[styles.card, { paddingBottom: theme.spacing.lg + insetBottom }]}>
      <View style={styles.handle} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        onPress={onClose}
        hitSlop={10}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={20} color={theme.colors.muted} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Abre el detalle del envío"
        onPress={onPressDetail}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={[styles.iconCircle, { backgroundColor: visual.fill, borderColor: visual.ring }]}>
          <Ionicons name={visual.icon} size={20} color={visual.iconColor} />
        </View>

        <View style={styles.texts}>
          <Text style={styles.address} numberOfLines={2}>
            {formatStopAddress(stop)}
          </Text>
          {locality !== null ? (
            <Text style={styles.locality} numberOfLines={1}>
              {locality}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={[styles.status, { color: statusColor(theme, kind) }]} numberOfLines={1}>
              {stopStatusLabel(stop)}
            </Text>
            {typeLabel !== null ? <Text style={styles.metaDot}>·</Text> : null}
            {typeLabel !== null ? (
              <Text style={styles.meta} numberOfLines={1}>
                {typeLabel}
              </Text>
            ) : null}
          </View>
          {stop.reference !== null ? (
            <Text style={styles.reference} numberOfLines={2}>
              {stop.reference}
            </Text>
          ) : null}
          <Text style={styles.tracking} numberOfLines={1}>
            {tracking !== null ? `Parada ${stop.sequence} · ${tracking}` : `Parada ${stop.sequence}`}
          </Text>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ir con Google Maps"
          accessibilityState={{ disabled: !canNavigate }}
          disabled={!canNavigate}
          onPress={onPressNavigate}
          style={({ pressed }) => [
            styles.primaryBtn,
            !canNavigate && styles.btnDisabled,
            pressed && canNavigate && styles.pressed,
          ]}
        >
          <Ionicons
            name="navigate"
            size={18}
            color={canNavigate ? ON_PRIMARY_INK : theme.colors.muted}
          />
          <Text style={[styles.primaryLabel, !canNavigate && styles.labelDisabled]}>Ir</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir detalle del envío"
          onPress={onPressDetail}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Ionicons name="document-text-outline" size={18} color={theme.colors.text} />
          <Text style={styles.secondaryLabel}>Detalle</Text>
        </Pressable>
      </View>

      {!canNavigate ? (
        <Text style={styles.noCoords}>
          Este destino no tiene coordenadas cargadas, así que no se puede abrir la navegación.
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: spacing.radiusCard + 6,
      borderTopRightRadius: spacing.radiusCard + 6,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
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
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    close: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted,
      zIndex: 2,
    },
    body: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingRight: spacing.xxl,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    texts: {
      flex: 1,
      minWidth: 0,
    },
    address: {
      ...typography.bodyStrong,
      fontSize: 17,
      color: colors.text,
    },
    locality: {
      ...typography.body,
      color: colors.muted,
      marginTop: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.xs,
      flexWrap: 'wrap',
    },
    status: {
      ...typography.captionStrong,
    },
    metaDot: {
      ...typography.caption,
      color: colors.muted,
    },
    meta: {
      ...typography.caption,
      color: colors.muted,
    },
    reference: {
      ...typography.caption,
      color: colors.text,
      marginTop: spacing.xs,
      opacity: 0.85,
    },
    tracking: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.xs,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 50,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.primary,
    },
    primaryLabel: {
      ...typography.bodyStrong,
      fontSize: 17,
      color: ON_PRIMARY_INK,
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 50,
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    secondaryLabel: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    btnDisabled: {
      backgroundColor: colors.surfaceMuted,
    },
    labelDisabled: {
      color: colors.muted,
    },
    noCoords: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.sm,
    },
    pressed: {
      opacity: motion.pressOpacitySoft,
    },
  });
}
