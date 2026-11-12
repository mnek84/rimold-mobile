import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Banner, Button, Card, SegmentedControl } from '@components/ui';
import type { TodayShipmentRow } from '@core/api/shipments';
import type { ChannelFilter } from '../hooks/useDeliveryList';
import { ChannelBadge } from './ChannelBadge';
import { useTheme, withAlpha, type AppTheme } from '@theme';

import {
  formatDriverShipmentStatusLabel,
  shipmentDriverPhaseIndex,
  shipmentListBadgeColors,
  shipmentListBadgeKind,
  type ShipmentListBadgeKind,
} from '../deliveryStatus';
import type { DeliveryListSection } from '../hooks/useDeliveryList';
import { DeliveryListSkeleton } from './DeliveryListSkeleton';

const PHASE_BAR_KEYS = ['p0', 'p1', 'p2', 'p3'] as const;

function phaseBarSegmentStyle(
  theme: AppTheme,
  kind: ShipmentListBadgeKind,
  phase: number,
  index: number,
): { backgroundColor: string } {
  const { colors } = theme;
  // Track vacío: translucidez no semántica derivada de `muted`.
  const empty = withAlpha(colors.muted, 0.18);
  // Fases cumplidas: acento de progreso (`brand` es relleno, nunca texto).
  if (kind === 'delivered') return { backgroundColor: colors.brand };
  if (kind === 'failed') {
    return { backgroundColor: index < 3 ? empty : colors.danger };
  }
  if (index < phase) return { backgroundColor: colors.brand };
  if (index === phase) return { backgroundColor: colors.primary };
  return { backgroundColor: empty };
}

type Props = {
  sections: DeliveryListSection[];
  loading: boolean;
  showInitialLoader: boolean;
  refreshing: boolean;
  error: string | null;
  nextShipmentId: string | null;
  flexBatchId: string | null;
  pendingCount: number;
  failedCount: number;
  deliveredTodayCount: number;
  onPressFlexMap?: () => void;
  onRefresh: () => void;
  onPressScan: () => void;
  onPressReportFailure: () => void;
  onPressShipment: (shipmentId: string) => void;
  channelFilter?: ChannelFilter;
  onChangeChannelFilter?: (next: ChannelFilter) => void;
  channelCounts?: { all: number; own: number; flex: number };
};

const CHANNEL_FILTERS: { key: ChannelFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'own', label: 'Propios' },
  { key: 'flex', label: 'Flex' },
];

export function DeliveryListView({
  sections,
  loading,
  showInitialLoader,
  refreshing,
  error,
  nextShipmentId,
  flexBatchId,
  pendingCount,
  failedCount,
  deliveredTodayCount,
  onPressFlexMap,
  onRefresh,
  onPressScan,
  onPressReportFailure,
  onPressShipment,
  channelFilter = 'all',
  onChangeChannelFilter,
  channelCounts,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const scanDisabled = loading || refreshing;
  const showFlexMap = flexBatchId != null && onPressFlexMap != null;
  const showCount = pendingCount > 0 || deliveredTodayCount > 0 || failedCount > 0;
  const countLabel = buildCountLabel(pendingCount, deliveredTodayCount, failedCount);

  const listChrome = useMemo(
    () => (
      <View style={styles.listHeader}>
        {showCount && <Text style={styles.countLabel}>{countLabel}</Text>}
        <Button
          variant="primary"
          size="lg"
          icon="scan-outline"
          disabled={scanDisabled}
          onPress={onPressScan}
        >
          Escanear paquete
        </Button>
        <Button
          variant="dangerOutline"
          icon="alert-circle-outline"
          disabled={scanDisabled}
          onPress={onPressReportFailure}
        >
          Reportar paquete fallido
        </Button>
        {onChangeChannelFilter != null && channelCounts != null && channelCounts.flex > 0 ? (
          <SegmentedControl
            style={styles.channelFilterRow}
            options={CHANNEL_FILTERS.map((f) => ({
              value: f.key,
              label: `${f.label} (${channelCounts[f.key]})`,
            }))}
            value={channelFilter}
            onChange={onChangeChannelFilter}
          />
        ) : null}
        {showFlexMap && (
          <Button
            variant="outline"
            icon="map-outline"
            onPress={onPressFlexMap}
            style={styles.flexMapBtn}
          >
            Mapa flex
          </Button>
        )}
      </View>
    ),
    [
      scanDisabled,
      showFlexMap,
      onPressScan,
      onPressReportFailure,
      onPressFlexMap,
      showCount,
      countLabel,
      channelFilter,
      onChangeChannelFilter,
      channelCounts,
      styles,
      theme.colors.danger,
    ],
  );

  const renderItem = ({ item }: { item: TodayShipmentRow }) => {
    const isNext = item.id === nextShipmentId;
    const badgeKind = shipmentListBadgeKind(item.status);
    const badgeColors = shipmentListBadgeColors(theme, badgeKind);
    const statusLabel = formatDriverShipmentStatusLabel(item.status);
    const phase = shipmentDriverPhaseIndex(item.status);

    return (
      <Card
        padding="none"
        onPress={() => onPressShipment(item.id)}
        style={[styles.shipmentCard, isNext && styles.shipmentCardNext]}
        accessibilityLabel={`Envío ${item.tracking_id}. ${item.channel.label}. ${statusLabel}.`}
        accessibilityHint="Abre el detalle del envío"
      >
        <View style={styles.shipmentCardClip}>
          {isNext && (
            <View style={styles.nextBanner}>
              <Ionicons name="navigate" size={14} color={theme.colors.chromeOn} />
              <Text style={styles.nextBannerText}>Siguiente entrega</Text>
            </View>
          )}
          <View style={styles.shipmentBody}>
            <View style={styles.titleRow}>
              <Text style={styles.trackingTitle} numberOfLines={1}>
                {item.tracking_id}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: badgeColors.bg, borderColor: badgeColors.border },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: badgeColors.text }]} numberOfLines={1}>
                  {statusLabel}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
            </View>

            <View style={styles.channelRow}>
              <ChannelBadge channel={item.channel} compact />
              {!item.channel.driverActionsAllowed ? (
                <Text style={styles.channelHint} numberOfLines={1}>
                  Se entrega con la app de Mercado Libre
                </Text>
              ) : null}
            </View>

            <View style={styles.phaseBar} importantForAccessibility="no-hide-descendants">
              {PHASE_BAR_KEYS.map((key, i) => (
                <View
                  key={key}
                  style={[styles.phaseSegment, phaseBarSegmentStyle(theme, badgeKind, phase, i)]}
                />
              ))}
            </View>

            <Text style={styles.addressText} numberOfLines={2}>
              {item.address.trim() !== '' ? item.address : 'Sin dirección'}
            </Text>
            {item.delivery_visit_count > 0 ? (
              <Text style={styles.visitHint} numberOfLines={1}>
                Visita de reparto: {item.delivery_visit_count}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    );
  };

  const renderItemSeparator = useCallback(() => <View style={styles.itemSeparator} />, [styles]);

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionRule} />
    </View>
  );

  const listEmpty = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="cube-outline" size={48} color={theme.colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>Sin envíos asignados</Text>
      <Text style={styles.emptyHint}>Escaneá un paquete para comenzar</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      {error != null && error !== '' ? (
        <Banner tone="danger" message={error} style={styles.banner} />
      ) : null}

      {showInitialLoader ? (
        <View style={styles.skeletonColumn}>
          {listChrome}
          <DeliveryListSkeleton />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ItemSeparatorComponent={renderItemSeparator}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listChrome}
          extraData={{ nextShipmentId, loading, refreshing }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          contentContainerStyle={
            sections.length === 0 && !showInitialLoader ? styles.listEmpty : styles.listContent
          }
          ListEmptyComponent={!showInitialLoader ? listEmpty : undefined}
        />
      )}
    </View>
  );
}

function buildCountLabel(pending: number, deliveredToday: number, failed: number): string {
  const parts: string[] = [];
  if (pending > 0) {
    parts.push(`${pending} ${pending === 1 ? 'envío por entregar' : 'envíos por entregar'}`);
  }
  if (deliveredToday > 0) {
    parts.push(
      `${deliveredToday} ${deliveredToday === 1 ? 'entregado hoy' : 'entregados hoy'}`,
    );
  }
  // `failed` no entra en `pending`: son dos cuentas disjuntas (ver
  // statusDeliveryGroup), así que los tres fragmentos suman la lista completa.
  if (failed > 0) {
    parts.push(`${failed} ${failed === 1 ? 'fallida' : 'fallidas'}`);
  }
  return parts.join(' · ');
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion, touch } = t;
  return StyleSheet.create({
    channelFilterRow: {
      marginTop: spacing.xs,
    },
    channelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      marginBottom: spacing.xs + 2,
    },
    channelHint: {
      ...typography.caption,
      color: colors.muted,
      flexShrink: 1,
    },
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listHeader: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    countLabel: {
      ...typography.captionStrong,
      color: colors.muted,
      letterSpacing: 0.4,
      paddingBottom: spacing.xs,
    },
    flexMapBtn: {
      alignSelf: 'flex-start',
    },
    banner: {
      marginBottom: spacing.sm,
    },
    skeletonColumn: {
      flex: 1,
    },
    listContent: {
      paddingBottom: spacing.xxl,
    },
    listEmpty: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    sectionHeader: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.captionStrong,
      color: colors.muted,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      marginBottom: spacing.xs,
    },
    sectionRule: {
      height: 1,
      backgroundColor: colors.border,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
      maxWidth: 320,
      alignSelf: 'center',
    },
    emptyIconCircle: {
      width: 96,
      height: 96,
      borderRadius: spacing.radiusPill,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    emptyTitle: {
      ...typography.subtitle,
      color: colors.text,
      textAlign: 'center',
    },
    emptyHint: {
      ...typography.body,
      color: colors.muted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    shipmentCard: {},
    shipmentCardClip: {
      borderRadius: spacing.radiusCard,
      overflow: 'hidden',
    },
    shipmentCardNext: {
      // Brand bar, not `primary`: in dark mode a full-width primary fill is a light-blue glare.
      borderColor: colors.chrome,
      borderWidth: 2,
    },
    nextBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.chrome,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
    },
    nextBannerText: {
      ...typography.captionStrong,
      color: colors.chromeOn,
      letterSpacing: 0.3,
    },
    shipmentBody: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    trackingTitle: {
      flex: 1,
      minWidth: 0,
      ...typography.subtitle,
      color: colors.text,
      letterSpacing: -0.2,
    },
    phaseBar: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    phaseSegment: {
      flex: 1,
      height: 6,
      borderRadius: spacing.radiusPill,
    },
    addressText: {
      ...typography.body,
      color: colors.muted,
    },
    visitHint: {
      ...typography.caption,
      color: colors.text,
      marginTop: spacing.xs,
    },
    statusBadge: {
      flexShrink: 0,
      // 40% cortaba etiquetas de una sola línea ('Entrega fallida',
      // 'Pendiente de ruta'); el tracking_id de al lado es corto y tiene flex: 1.
      maxWidth: '48%',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: spacing.radiusSm,
      borderWidth: StyleSheet.hairlineWidth,
    },
    statusBadgeText: {
      ...typography.captionStrong,
      textAlign: 'center',
    },
    itemSeparator: {
      height: spacing.sm,
    },
  });
}
