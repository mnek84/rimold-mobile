import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Banner, Button, Card, SegmentedControl } from '@components/ui';
import type { TodayShipmentRow } from '@core/api/shipments';
import { useTheme, withAlpha, type AppTheme } from '@theme';

import {
  formatDriverShipmentStatusLabel,
  shipmentDriverPhaseIndex,
  shipmentListBadgeColors,
  shipmentListBadgeKind,
  type ShipmentListBadgeKind,
} from '../deliveryStatus';
import type { DeliveryListSection } from '../hooks/useDeliveryList';
import {
  channelLines,
  FILTER_LABEL,
  isFlexRow,
  plural,
  rowState,
  type RowCounts,
  type WorkdayFilter,
} from '../workdayView';
import { formatLastUpdate } from '../lastUpdate';
import { ChannelBadge } from './ChannelBadge';
import { DeliveryListSkeleton } from './DeliveryListSkeleton';
import { OpenFlexAppButton } from './OpenFlexAppButton';

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
  /** Conteos de la jornada completa (no del filtro): propios + Flex. */
  counts: RowCounts;
  filter: WorkdayFilter;
  onChangeFilter: (next: WorkdayFilter) => void;
  onRefresh: () => void;
  onPressScan: () => void;
  onPressReportFailure: () => void;
  onPressShipment: (shipmentId: string) => void;
  /** Abre "Finalizar jornada". Sin él, no se muestra el botón. */
  onPressFinishWorkday?: () => void;
  /** Eventos que el servidor rechazó como inválidos (cola offline). */
  permanentSyncFailures?: number;
};

const FILTERS: WorkdayFilter[] = ['pending', 'delivered', 'incident'];

/**
 * La jornada en una sola lista: propios y Flex juntos.
 *
 * Arriba, el resumen (cuántos, cuántos de cada tipo y quién los confirma) y
 * el único filtro que sirve para decidir: Pendientes · Entregados ·
 * Incidencias. Reemplaza "Todos / Propios / Flex", que partía la jornada por
 * un eje que ya se ve en cada tarjeta y contaba envíos de todo el año.
 */
export function DeliveryListView({
  sections,
  loading,
  showInitialLoader,
  refreshing,
  error,
  nextShipmentId,
  counts,
  filter,
  onChangeFilter,
  onRefresh,
  onPressScan,
  onPressReportFailure,
  onPressShipment,
  onPressFinishWorkday,
  permanentSyncFailures = 0,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const scanDisabled = loading || refreshing;
  const closed = counts.delivered + counts.incident;
  const progressPct = counts.total > 0 ? Math.round((closed / counts.total) * 100) : 0;

  const listChrome = useMemo(
    () => (
      <View style={styles.listHeader}>
        {counts.total > 0 ? (
          <View
            style={styles.summaryCard}
            accessible
            accessibilityLabel={`Tu jornada: ${plural(counts.total, 'envío', 'envíos')}. ${counts.pending} pendientes, ${counts.delivered} entregados, ${counts.incident} con incidencia.`}
          >
            <View style={styles.summaryTitleRow}>
              <Text style={styles.summaryTitle}>Tu jornada · {plural(counts.total, 'envío', 'envíos')}</Text>
              <Text style={styles.summaryProgressLabel}>
                {closed}/{counts.total} cerrados
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            {channelLines(counts).map((line) => (
              <Text key={line} style={styles.summaryLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {permanentSyncFailures > 0 ? (
          <Banner
            tone="danger"
            message={`${plural(permanentSyncFailures, 'cambio no se pudo registrar', 'cambios no se pudieron registrar')} en el servidor. Avisale a tu supervisor.`}
          />
        ) : null}
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
        {onPressFinishWorkday != null && counts.total > 0 ? (
          <Button variant="outline" icon="flag-outline" onPress={onPressFinishWorkday}>
            Finalizar jornada
          </Button>
        ) : null}
        {counts.total > 0 ? (
          <SegmentedControl
            style={styles.filterRow}
            accessibilityLabel="Filtrar envíos de la jornada"
            options={FILTERS.map((f) => ({ value: f, label: `${FILTER_LABEL[f]} (${counts[f]})` }))}
            value={filter}
            onChange={onChangeFilter}
          />
        ) : null}
      </View>
    ),
    [
      scanDisabled,
      onPressScan,
      onPressReportFailure,
      onPressFinishWorkday,
      counts,
      closed,
      progressPct,
      filter,
      onChangeFilter,
      permanentSyncFailures,
      styles,
    ],
  );

  const renderItem = ({ item }: { item: TodayShipmentRow }) => {
    const isNext = item.id === nextShipmentId;
    const badgeKind = shipmentListBadgeKind(item.status);
    const badgeColors = shipmentListBadgeColors(theme, badgeKind);
    const statusLabel = formatDriverShipmentStatusLabel(item.status);
    const phase = shipmentDriverPhaseIndex(item.status);
    const flex = isFlexRow(item);

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
              <Text style={styles.channelHint} numberOfLines={1}>
                {flex ? 'Se confirma en Mercado Libre Flex' : 'Se confirma en esta app'}
              </Text>
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
            {formatLastUpdate(item.last_status_at) !== null ? (
              <Text style={styles.visitHint} numberOfLines={1}>
                {formatLastUpdate(item.last_status_at)}
              </Text>
            ) : null}
            {item.delivery_visit_count > 0 ? (
              <Text style={styles.visitHint} numberOfLines={1}>
                Visita de reparto: {item.delivery_visit_count}
              </Text>
            ) : null}
            {flex && rowState(item) === 'pending' ? (
              <View style={styles.flexAction}>
                <OpenFlexAppButton variant="outline" size="sm" fullWidth={false} />
              </View>
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

  const emptyTitle =
    counts.total === 0
      ? 'Sin envíos asignados'
      : filter === 'pending'
        ? 'No te quedan entregas pendientes'
        : filter === 'delivered'
          ? 'Todavía no hay entregas hoy'
          : 'Sin incidencias hoy';

  const listEmpty = (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="cube-outline" size={48} color={theme.colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{emptyTitle}</Text>
      <Text style={styles.emptyHint}>
        {counts.total === 0 ? 'Escaneá un paquete para comenzar' : 'Cambiá el filtro para ver el resto de la jornada'}
      </Text>
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
          extraData={{ nextShipmentId, loading, refreshing, filter }}
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

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    filterRow: {
      marginTop: spacing.xs,
    },
    summaryCard: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: spacing.radiusCard,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    summaryTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    summaryTitle: {
      ...typography.bodyStrong,
      color: colors.text,
      flexShrink: 1,
    },
    summaryProgressLabel: {
      ...typography.captionStrong,
      color: colors.muted,
    },
    progressTrack: {
      height: 6,
      borderRadius: spacing.radiusPill,
      backgroundColor: withAlpha(colors.muted, 0.18),
      overflow: 'hidden',
    },
    progressFill: {
      height: 6,
      borderRadius: spacing.radiusPill,
      backgroundColor: colors.brand,
    },
    summaryLine: {
      ...typography.caption,
      color: colors.muted,
    },
    flexAction: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
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
