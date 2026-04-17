import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card } from '@components/ui';
import type { TodayShipmentRow } from '@core/api/shipments';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

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
  const empty = `${colors.muted}24`;
  if (kind === 'delivered') return { backgroundColor: `${colors.success}66` };
  if (kind === 'failed') {
    return { backgroundColor: index < 3 ? `${colors.muted}38` : `${colors.danger}70` };
  }
  if (index < phase) return { backgroundColor: `${colors.success}50` };
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
  onPressFlexMap?: () => void;
  onRefresh: () => void;
  onPressScan: () => void;
  onPressShipment: (shipmentId: string) => void;
};

export function DeliveryListView({
  sections,
  loading,
  showInitialLoader,
  refreshing,
  error,
  nextShipmentId,
  flexBatchId,
  onPressFlexMap,
  onRefresh,
  onPressScan,
  onPressShipment,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const scanDisabled = loading || refreshing;
  const totalShipments = sections.reduce((acc, s) => acc + s.data.length, 0);
  const showFlexMap = flexBatchId != null && onPressFlexMap != null;

  const listChrome = useMemo(
    () => (
      <View style={styles.listHeader}>
        {totalShipments > 0 && (
          <Text style={styles.countLabel}>
            {totalShipments} {totalShipments === 1 ? 'envío' : 'envíos'} de hoy
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escanear paquete"
          accessibilityState={{ disabled: scanDisabled }}
          disabled={scanDisabled}
          style={({ pressed }) => [
            styles.btnScan,
            scanDisabled && styles.btnScanDisabled,
            pressed && !scanDisabled && styles.btnPressed,
          ]}
          onPress={onPressScan}
        >
          <Ionicons
            name="scan-outline"
            size={20}
            color={scanDisabled ? theme.colors.muted : '#ffffff'}
            style={styles.scanIcon}
          />
          <Text style={[styles.btnScanLabel, scanDisabled && styles.btnScanLabelDisabled]}>
            Escanear paquete
          </Text>
        </Pressable>
        {showFlexMap && (
          <Pressable
            accessibilityRole="button"
            onPress={onPressFlexMap}
            style={({ pressed }) => [styles.flexMapBtn, pressed && styles.btnPressed]}
          >
            <Ionicons name="map-outline" size={15} color={theme.colors.primary} />
            <Text style={styles.flexMapLabel}>Mapa flex</Text>
          </Pressable>
        )}
      </View>
    ),
    [
      scanDisabled,
      showFlexMap,
      onPressScan,
      onPressFlexMap,
      totalShipments,
      styles,
      theme.colors.muted,
      theme.colors.primary,
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
        accessibilityLabel={`Envío ${item.tracking_id}. ${statusLabel}.`}
        accessibilityHint="Abre el detalle del envío"
      >
        <View style={styles.shipmentCardClip}>
          {isNext && (
            <View style={styles.nextBanner}>
              <Ionicons name="navigate" size={13} color="#ffffff" />
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
      {error != null && error !== '' ? <Text style={styles.banner}>{error}</Text> : null}

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
          ListEmptyComponent={!showInitialLoader ? listEmpty : null}
        />
      )}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
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
    btnScan: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.primary,
      gap: spacing.sm,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    btnScanDisabled: {
      backgroundColor: colors.surface,
      ...Platform.select({
        ios: { shadowOpacity: 0 },
        android: { elevation: 0 },
        default: {},
      }),
    },
    scanIcon: {
      marginRight: 2,
    },
    btnScanLabel: {
      ...typography.bodyStrong,
      fontSize: 17,
      color: '#ffffff',
    },
    btnScanLabelDisabled: {
      color: colors.muted,
    },
    flexMapBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: borderSubtle,
    },
    flexMapLabel: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    btnPressed: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
    banner: {
      marginBottom: spacing.sm,
      padding: spacing.md,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.danger,
      color: colors.danger,
      ...typography.body,
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
      backgroundColor: borderSubtle,
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
      borderRadius: 48,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: borderSubtle,
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
      borderColor: colors.primary,
      borderWidth: 2,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
        },
        android: { elevation: 5 },
        default: {},
      }),
    },
    nextBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
    },
    nextBannerText: {
      ...typography.captionStrong,
      color: '#ffffff',
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
      gap: 4,
      marginBottom: spacing.sm,
    },
    phaseSegment: {
      flex: 1,
      height: 6,
      borderRadius: 3,
    },
    addressText: {
      ...typography.body,
      color: colors.muted,
    },
    statusBadge: {
      flexShrink: 0,
      maxWidth: '40%',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
      borderRadius: spacing.radiusMd,
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
