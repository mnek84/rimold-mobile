import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card } from '@components/ui';
import type { TodayShipmentRow } from '@core/api/shipments';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

import {
  formatShipmentStatusLabel,
  shipmentListBadgeColors,
  shipmentListBadgeKind,
} from '../deliveryStatus';
import type { DeliveryListSection } from '../hooks/useDeliveryList';
import { DeliveryListSkeleton } from './DeliveryListSkeleton';

type Props = {
  sections: DeliveryListSection[];
  /** True while any shipments fetch is in flight (initial or refresh). */
  loading: boolean;
  showInitialLoader: boolean;
  refreshing: boolean;
  error: string | null;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  nextShipmentId: string | null;
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
  searchQuery,
  onSearchQueryChange,
  nextShipmentId,
  onRefresh,
  onPressScan,
  onPressShipment,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const scanDisabled = loading || refreshing;
  const searchDisabled = showInitialLoader;

  const listChrome = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: scanDisabled }}
            disabled={scanDisabled}
            style={({ pressed }) => [
              styles.btnScan,
              scanDisabled && styles.chromeDisabled,
              pressed && !scanDisabled && styles.btnPressed,
            ]}
            onPress={onPressScan}
          >
            <Text style={[styles.btnScanLabel, scanDisabled && styles.chromeLabelDisabled]}>
              Scan package
            </Text>
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <TextInput
            style={[styles.searchInput, searchDisabled && styles.chromeDisabled]}
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            placeholder="Buscar por seguimiento o dirección…"
            placeholderTextColor={theme.colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            editable={!searchDisabled}
          />
        </View>
      </View>
    ),
    [
      onPressScan,
      onSearchQueryChange,
      scanDisabled,
      searchDisabled,
      searchQuery,
      styles,
      theme.colors.muted,
    ],
  );

  const renderItem = ({ item }: { item: TodayShipmentRow }) => {
    const isNext = item.id === nextShipmentId;
    const badgeKind = shipmentListBadgeKind(item.status);
    const badgeColors = shipmentListBadgeColors(theme, badgeKind);
    return (
      <Card
        padding="none"
        onPress={() => onPressShipment(item.id)}
        style={[styles.shipmentCard, isNext && styles.shipmentCardNext]}
      >
        <View style={styles.shipmentCardClip}>
          {isNext ? (
            <View style={styles.nextBadge}>
              <Text style={styles.nextBadgeText}>Siguiente</Text>
            </View>
          ) : null}
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
                  {formatShipmentStatusLabel(item.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.addressSecondary} numberOfLines={2}>
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

  const listEmpty = useMemo(() => {
    const searching = searchQuery.trim() !== '';
    return (
      <View
        style={styles.emptyState}
        accessibilityLabel={
          searching
            ? 'Ningún envío coincide con la búsqueda.'
            : 'No hay envíos asignados. Escaneá un paquete para comenzar.'
        }
      >
        {searching ? (
          <>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="search-outline" size={40} color={theme.colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>Ningún envío coincide con la búsqueda.</Text>
          </>
        ) : (
          <>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="cube-outline" size={48} color={theme.colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>No hay envíos asignados</Text>
            <Text style={styles.emptyHint}>Escaneá un paquete para comenzar</Text>
          </>
        )}
      </View>
    );
  }, [searchQuery, styles, theme.colors.muted]);

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
          extraData={{ nextShipmentId, searchQuery, loading, refreshing }}
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
      paddingBottom: spacing.sm,
    },
    toolbar: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    searchWrap: {
      marginBottom: spacing.sm,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: borderSubtle,
      borderRadius: spacing.radiusLg,
      paddingHorizontal: spacing.md + 4,
      paddingVertical: spacing.md,
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    btnScan: {
      paddingVertical: spacing.md,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: borderSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    btnScanLabel: {
      ...typography.bodyStrong,
      color: colors.text,
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
    chromeDisabled: {
      opacity: 0.48,
    },
    chromeLabelDisabled: {
      color: colors.muted,
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
      opacity: 0.9,
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
          shadowOpacity: 0.35,
          shadowRadius: 10,
        },
        android: {
          elevation: 5,
        },
        default: {},
      }),
    },
    nextBadge: {
      backgroundColor: colors.primary,
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
    },
    nextBadgeText: {
      ...typography.captionStrong,
      color: colors.background,
      letterSpacing: 0.5,
    },
    itemSeparator: {
      paddingTop: spacing.md,
      marginBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: borderSubtle,
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
    },
    addressSecondary: {
      ...typography.body,
      color: colors.muted,
    },
    statusBadge: {
      flexShrink: 0,
      maxWidth: '46%',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      borderRadius: spacing.radiusMd,
      borderWidth: StyleSheet.hairlineWidth,
    },
    statusBadgeText: {
      ...typography.captionStrong,
      textTransform: 'capitalize',
      textAlign: 'center',
    },
  });
}
