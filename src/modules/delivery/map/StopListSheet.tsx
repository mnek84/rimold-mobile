import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import type { RouteStopView } from '@core/api/routes';
import { useTheme, type AppTheme } from '@theme';

import { ChannelBadge } from '../components/ChannelBadge';
import { stopPositionLabel } from './StopPreviewCard';

import {
  formatStopAddress,
  formatStopLocality,
  hasCoordinates,
  isVisitedKind,
  stopStatusLabel,
  stopVisualKind,
  stopVisualStyle,
} from './stopPresentation';

type Section = { title: string; data: RouteStopView[] };

type Props = {
  visible: boolean;
  stops: RouteStopView[];
  selectedStopId: string | null;
  onClose: () => void;
  /** Centra el mapa en la parada y la selecciona. Cierra la hoja. */
  onPressStop: (stopId: string) => void;
  onPressNavigate: (stopId: string) => void;
  insetTop: number;
  insetBottom: number;
};

/**
 * La lista completa, a un toque del mapa.
 *
 * Dos secciones y no cuatro: lo que falta y lo que ya tiene novedad. El mapa
 * responde "dónde"; esta hoja responde "qué me queda", que es la pregunta que
 * se hace con el auto detenido.
 */
export function StopListSheet({
  visible,
  stops,
  selectedStopId,
  onClose,
  onPressStop,
  onPressNavigate,
  insetTop,
  insetBottom,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const sections = useMemo<Section[]>(() => {
    const pending: RouteStopView[] = [];
    const visited: RouteStopView[] = [];
    for (const stop of stops) {
      (isVisitedKind(stopVisualKind(stop)) ? visited : pending).push(stop);
    }
    return [
      { title: `Por visitar (${pending.length})`, data: pending },
      { title: `Con novedad (${visited.length})`, data: visited },
    ].filter((section) => section.data.length > 0);
  }, [stops]);

  const renderItem = useCallback(
    ({ item }: { item: RouteStopView }) => {
      const kind = stopVisualKind(item);
      const visual = stopVisualStyle(theme, kind, item.addressTypeCode);
      const locality = formatStopLocality(item);
      const navigable = hasCoordinates(item);
      const selected = item.id === selectedStopId;

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${stopPositionLabel(item)}. ${formatStopAddress(item)}. ${stopStatusLabel(item)}.${item.unlocatableLabel != null ? ` ${item.unlocatableLabel}.` : ''}`}
          accessibilityHint="Centra la parada en el mapa"
          onPress={() => onPressStop(item.id)}
          style={({ pressed }) => [
            styles.row,
            selected && styles.rowSelected,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: visual.fill, borderColor: visual.ring }]}>
            <Ionicons name={visual.icon} size={18} color={visual.iconColor} />
          </View>

          <View style={styles.rowTexts}>
            <Text style={styles.rowAddress} numberOfLines={1}>
              {formatStopAddress(item)}
            </Text>
            {locality !== null ? (
              <Text style={styles.rowLocality} numberOfLines={1}>
                {locality}
              </Text>
            ) : null}
            <Text style={styles.rowMeta} numberOfLines={1}>
              {stopPositionLabel(item)} · {stopStatusLabel(item)}
              {(item.shipmentCount ?? 1) > 1 ? ` · ${item.shipmentCount} envíos` : ''}
            </Text>
            {item.unlocatableLabel != null ? (
              <Text style={styles.rowWarning} numberOfLines={2}>
                {item.unlocatableLabel}
              </Text>
            ) : null}
            {item.groupShipments !== undefined && item.groupShipments.length > 0 ? (
              <View style={styles.rowBadges}>
                {/* Un badge por canal presente en el punto (sin repetir). */}
                {Array.from(new Map(item.groupShipments.map((g) => [g.channel.label, g.channel])).values()).map((c) => (
                  <ChannelBadge key={c.label} channel={c} compact />
                ))}
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ir a la parada ${item.sequence}`}
            accessibilityState={{ disabled: !navigable }}
            disabled={!navigable}
            onPress={() => onPressNavigate(item.id)}
            style={({ pressed }) => [
              styles.rowGo,
              !navigable && styles.rowGoDisabled,
              pressed && navigable && styles.pressed,
            ]}
          >
            <Ionicons
              name="navigate"
              size={22}
              color={navigable ? theme.colors.primaryOn : theme.colors.muted}
            />
          </Pressable>
        </Pressable>
      );
    },
    [onPressNavigate, onPressStop, selectedStopId, styles, theme],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
      </View>
    ),
    [styles],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar la lista"
        style={[styles.backdrop, { paddingTop: insetTop + 64 }]}
        onPress={onClose}
      >
        {/* El panel detiene el toque: tocar la lista no cierra la hoja. */}
        <Pressable style={styles.panel} onPress={() => undefined}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Paradas de hoy</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={onClose}
              hitSlop={theme.touch.hitSlop}
              style={({ pressed }) => [styles.headerClose, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={theme.colors.muted} />
            </Pressable>
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insetBottom + theme.spacing.xxl },
            ]}
            ListEmptyComponent={
              <Text style={styles.empty}>No tenés paradas asignadas para hoy.</Text>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion, touch } = t;
  return StyleSheet.create({
    rowWarning: {
      ...typography.caption,
      color: colors.danger,
      marginTop: spacing.xxs,
    },
    rowBadges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'flex-end',
    },
    panel: {
      flex: 1,
      backgroundColor: colors.background,
      borderTopLeftRadius: spacing.radiusCard,
      borderTopRightRadius: spacing.radiusCard,
      overflow: 'hidden',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: spacing.xs,
      borderRadius: spacing.xxs,
      backgroundColor: colors.border,
      marginTop: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    headerTitle: {
      ...typography.subtitle,
      color: colors.text,
    },
    headerClose: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: spacing.radiusPill,
      backgroundColor: colors.surfaceMuted,
    },
    listContent: {
      paddingHorizontal: spacing.lg,
    },
    sectionHeader: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.captionStrong,
      color: colors.muted,
      letterSpacing: 1.1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    rowSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: spacing.radiusPill,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTexts: {
      flex: 1,
      minWidth: 0,
    },
    rowAddress: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    rowLocality: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.xxs,
    },
    rowMeta: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.xxs,
    },
    rowGo: {
      width: touch.min,
      height: touch.min,
      borderRadius: spacing.radiusLg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    rowGoDisabled: {
      backgroundColor: colors.surfaceMuted,
      opacity: motion.disabledOpacity,
    },
    empty: {
      ...typography.body,
      color: colors.muted,
      textAlign: 'center',
      paddingVertical: spacing.xxl,
    },
    pressed: {
      opacity: motion.pressOpacitySoft,
    },
  });
}
