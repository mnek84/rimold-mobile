import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@components/ui';
import type { RouteStopView } from '@core/api/routes';
import { useTheme, type AppTheme } from '@theme';

import { ChannelBadge } from '../components/ChannelBadge';
import { OpenFlexAppButton } from '../components/OpenFlexAppButton';
import { formatLastUpdate } from '../lastUpdate';
import { formatDriverShipmentStatusLabel } from '../deliveryStatus';
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
  /** Abre el detalle de un envío puntual del grupo (vista unificada). */
  onPressShipment?: (shipmentId: string) => void;
};

/**
 * Rótulo de posición. Las secuencias ≥ 10000 las pone la vista unificada a los
 * puntos que no están en la ruta interna (sólo Flex) y ≥ 20000 a los no
 * ubicables: no son "Parada 10003", y decirlo así confundiría al chofer.
 */
export function stopPositionLabel(stop: RouteStopView): string {
  if (stop.unlocatableReason != null) return 'Sin ubicación en el mapa';
  if (stop.sequence >= 10_000) return 'Fuera de la ruta propia';
  return `Parada ${stop.sequence}`;
}

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
  onPressShipment,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const kind = stopVisualKind(stop);
  const visual = stopVisualStyle(theme, kind, stop.addressTypeCode);
  const locality = formatStopLocality(stop);
  const typeLabel = addressTypeLabel(stop.addressTypeCode);
  const tracking = stop.tracking;
  // Envíos Flex todavía abiertos en este punto: su entrega se confirma en
  // Mercado Libre Flex, así que la acción contextual es abrir esa app.
  const openFlexCount = (stop.groupShipments ?? []).filter(
    (g) => g.channel.operator === 'mercadolibre_flex' && !g.isFinal,
  ).length;

  return (
    <View style={[styles.card, { paddingBottom: theme.spacing.lg + insetBottom }]}>
      <View style={styles.handle} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        onPress={onClose}
        hitSlop={theme.touch.hitSlop}
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
            {tracking !== null ? `${stopPositionLabel(stop)} · ${tracking}` : stopPositionLabel(stop)}
          </Text>
          {stop.groupShipments !== undefined && stop.groupShipments.length === 1 ? (
            <ChannelBadge channel={stop.groupShipments[0].channel} compact />
          ) : null}
        </View>
      </Pressable>

      {stop.locationConflict === true ? (
        <Text style={styles.noCoords}>
          Hay envíos con esta misma dirección marcados a más de 30 m entre sí: revisá el número antes de entregar.
        </Text>
      ) : null}

      {stop.groupShipments !== undefined && stop.groupShipments.length > 0 ? (
        <View style={styles.groupList} accessibilityLabel={`${stop.groupShipments.length} envíos en este punto`}>
          {stop.groupShipments.map((g) => {
            const flex = g.channel.operator === 'mercadolibre_flex';
            const status = flex && g.externalStatus !== null
              ? `ML: ${g.externalStatus}`
              : formatDriverShipmentStatusLabel(g.statusCode ?? '');
            return (
              <Pressable
                key={g.shipmentId}
                accessibilityRole="button"
                accessibilityLabel={`Envío ${g.tracking ?? ''}, ${g.channel.label}, ${status}`}
                onPress={() => onPressShipment?.(g.shipmentId)}
                style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}
              >
                <View style={styles.groupRowTexts}>
                  <Text style={[styles.groupTracking, g.isFinal && styles.groupTrackingDone]} numberOfLines={1}>
                    {g.tracking ?? 'Sin tracking'}
                    {g.addressLine2 !== null ? ` · ${g.addressLine2}` : ''}
                  </Text>
                  <Text style={styles.groupStatus} numberOfLines={1}>{status}</Text>
                  {/* Tipo de tarea, quién recibe y desde cuándo está así. */}
                  <Text style={styles.groupStatus} numberOfLines={2}>
                    {[g.taskKindLabel, g.recipientName != null ? `Recibe: ${g.recipientName}` : null, formatLastUpdate(g.lastStatusAt)]
                      .filter((part): part is string => part != null && part !== '')
                      .join(' · ')}
                  </Text>
                </View>
                <ChannelBadge channel={g.channel} compact />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          variant="primary"
          size="lg"
          icon="navigate"
          accessibilityLabel="Ir con Google Maps"
          disabled={!canNavigate}
          onPress={onPressNavigate}
          style={styles.primaryBtn}
        >
          Ir
        </Button>

        <Button
          variant="secondary"
          size="lg"
          icon="document-text-outline"
          fullWidth={false}
          accessibilityLabel="Abrir detalle del envío"
          onPress={onPressDetail}
        >
          Detalle
        </Button>
      </View>

      {openFlexCount > 0 ? (
        <View style={styles.flexAction}>
          <Text style={styles.flexHint}>
            {openFlexCount === 1
              ? 'Hay 1 envío Flex en este punto: su entrega se confirma en Mercado Libre Flex.'
              : `Hay ${openFlexCount} envíos Flex en este punto: su entrega se confirma en Mercado Libre Flex.`}
          </Text>
          <OpenFlexAppButton variant="outline" />
        </View>
      ) : null}

      {!canNavigate ? (
        <Text style={styles.noCoords}>
          {stop.unlocatableLabel != null
            ? `${stop.unlocatableLabel}: no se puede abrir la navegación ni dibujar en el mapa.`
            : 'Este destino no tiene coordenadas cargadas, así que no se puede abrir la navegación.'}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion, touch } = t;
  return StyleSheet.create({
    groupList: {
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touch.min,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surfaceMuted,
    },
    groupRowTexts: {
      flex: 1,
    },
    groupTracking: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    groupTrackingDone: {
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    groupStatus: {
      ...typography.caption,
      color: colors.muted,
    },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: spacing.radiusCard,
      borderTopRightRadius: spacing.radiusCard,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      // Floats over the map: keeps its (neutral) shadow.
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
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
      height: spacing.xs,
      borderRadius: spacing.xxs,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    close: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: spacing.radiusPill,
      backgroundColor: colors.surfaceMuted,
      zIndex: 2,
    },
    body: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingRight: spacing.xxl + spacing.sm,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: spacing.radiusPill,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    texts: {
      flex: 1,
      minWidth: 0,
    },
    address: {
      ...typography.subtitle,
      color: colors.text,
    },
    locality: {
      ...typography.body,
      color: colors.muted,
      marginTop: spacing.xxs,
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
    },
    flexAction: {
      marginTop: spacing.md,
      gap: spacing.xs,
    },
    flexHint: {
      ...typography.caption,
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
