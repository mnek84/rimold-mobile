import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, ScreenContainer } from '@components/ui';
import {
  fetchDeliveryHistory,
  type DeliveryHistoryDay,
  type DeliveryHistoryItem,
} from '@modules/delivery/api/deliveryHistory';
import type { DeliveryStackParamList } from '@navigation/deliveryStackTypes';
import { useTheme, type AppTheme } from '@theme';

import {
  formatDriverShipmentStatusLabel,
  shipmentListBadgeColors,
  shipmentListBadgeKind,
} from './deliveryStatus';

type Props = NativeStackScreenProps<DeliveryStackParamList, 'DeliveryHistory'>;

type HistorySection = {
  title: string;
  totalDeliveries: number;
  expanded: boolean;
  allShipments: DeliveryHistoryItem[];
  data: DeliveryHistoryItem[];
};

const STAGGER_MS = 28;
const MAX_STAGGER_INDEX = 18;

function currentLocalMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonthsToKey(monthKey: string, delta: number): string {
  const [yy, mm] = monthKey.split('-').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(yy) || !Number.isFinite(mm)) {
    return currentLocalMonth();
  }
  const base = new Date(yy, mm - 1 + delta, 1);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonthLabel(monthKey: string): string {
  const [yy, mm] = monthKey.split('-').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) {
    return monthKey;
  }
  try {
    const formatter = new Intl.DateTimeFormat('es-AR', {
      month: 'long',
      year: 'numeric',
    });
    const raw = formatter.format(new Date(yy, mm - 1, 1)).replace(/\./g, '');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  } catch {
    return monthKey;
  }
}

function formatDayLabel(isoDate: string): string {
  try {
    const [yy, mm, dd] = isoDate.split('-').map((n) => Number.parseInt(n, 10));
    if (
      !Number.isFinite(yy) ||
      !Number.isFinite(mm) ||
      !Number.isFinite(dd) ||
      mm < 1 ||
      mm > 12 ||
      dd < 1 ||
      dd > 31
    ) {
      return isoDate;
    }
    const date = new Date(yy, mm - 1, dd);
    const formatter = new Intl.DateTimeFormat('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const out = formatter.format(date).replace(/\./g, '');
    return out.charAt(0).toUpperCase() + out.slice(1);
  } catch {
    return isoDate;
  }
}

function formatDeliveredAtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

function pluralEntregas(n: number): string {
  return n === 1 ? '1 entrega' : `${n} entregas`;
}

export function DeliveryHistoryScreen(_props: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const [month, setMonth] = useState<string>(() => currentLocalMonth());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  const currentMonthKey = currentLocalMonth();
  const canGoForward = month < currentMonthKey;

  const query = useQuery({
    queryKey: ['delivery', 'history', month] as const,
    queryFn: ({ signal }) => fetchDeliveryHistory({ month, signal }),
    staleTime: 30_000,
  });

  const onChangeMonth = useCallback((delta: number) => {
    setMonth((prev) => {
      const target = addMonthsToKey(prev, delta);
      // Do not allow browsing beyond the current local month.
      if (target > currentLocalMonth()) {
        return prev;
      }
      return target;
    });
    setExpandedDays(new Set());
  }, []);

  const toggleDay = useCallback((dayKey: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  }, []);

  const sections = useMemo<HistorySection[]>(() => {
    const days: DeliveryHistoryDay[] = query.data?.days ?? [];
    return days.map((day) => {
      const expanded = expandedDays.has(day.date);
      return {
        title: day.date,
        totalDeliveries: day.totalDeliveries,
        expanded,
        allShipments: day.shipments,
        data: expanded ? day.shipments : [],
      };
    });
  }, [query.data, expandedDays]);

  const monthTotals = useMemo(() => {
    const days = query.data?.days ?? [];
    let deliveries = 0;
    for (const d of days) {
      deliveries += d.totalDeliveries;
    }
    return { days: days.length, deliveries };
  }, [query.data]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: HistorySection }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: section.expanded }}
        accessibilityLabel={`${formatDayLabel(section.title)}, ${pluralEntregas(section.totalDeliveries)}, ${section.expanded ? 'expandido' : 'colapsado'}`}
        onPress={() => toggleDay(section.title)}
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && styles.sectionHeaderPressed,
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <Ionicons
            name={section.expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={theme.colors.muted}
          />
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{formatDayLabel(section.title)}</Text>
            <Text style={styles.sectionSummary}>
              {pluralEntregas(section.totalDeliveries)}
            </Text>
          </View>
        </View>
      </Pressable>
    ),
    [
      styles.sectionHeader,
      styles.sectionHeaderPressed,
      styles.sectionHeaderRow,
      styles.sectionHeaderText,
      styles.sectionSummary,
      styles.sectionTitle,
      theme.colors.muted,
      toggleDay,
    ],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: DeliveryHistoryItem; index: number }) => {
      const delay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS;
      const time = formatDeliveredAtTime(item.deliveredAt);
      const badgeKind = shipmentListBadgeKind(item.status);
      const badgeColors = shipmentListBadgeColors(theme, badgeKind);
      const statusLabel = formatDriverShipmentStatusLabel(item.status);

      const card = (
        <Card padding="md" style={styles.itemCard}>
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemTracking} numberOfLines={1}>
              {item.trackingId !== '' ? item.trackingId : '—'}
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
          </View>
          {item.address !== '' ? (
            <Text style={styles.itemAddress} numberOfLines={2}>
              {item.address}
            </Text>
          ) : null}
          {time !== '' ? (
            <View style={styles.itemMetaRow}>
              <Ionicons name="time-outline" size={13} color={theme.colors.muted} />
              <Text style={styles.itemMetaText}>{time}</Text>
            </View>
          ) : null}
        </Card>
      );

      if (Platform.OS === 'web') {
        return <View key={item.id}>{card}</View>;
      }
      return (
        <Animated.View key={item.id} entering={FadeInDown.duration(220).delay(delay)}>
          {card}
        </Animated.View>
      );
    },
    [
      styles.itemAddress,
      styles.itemCard,
      styles.itemHeaderRow,
      styles.itemMetaRow,
      styles.itemMetaText,
      styles.itemTracking,
      styles.statusBadge,
      styles.statusBadgeText,
      theme,
    ],
  );

  const keyExtractor = useCallback((item: DeliveryHistoryItem) => item.id, []);

  const monthHeader = (
    <View style={styles.monthHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mes anterior"
        onPress={() => onChangeMonth(-1)}
        hitSlop={8}
        style={({ pressed }) => [styles.monthNav, pressed && styles.monthNavPressed]}
      >
        <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
      </Pressable>
      <View style={styles.monthLabelWrapper}>
        <Text style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
        {monthTotals.deliveries > 0 ? (
          <Text style={styles.monthSummary}>
            {pluralEntregas(monthTotals.deliveries)} en {monthTotals.days === 1 ? '1 día' : `${monthTotals.days} días`}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mes siguiente"
        accessibilityState={{ disabled: !canGoForward }}
        disabled={!canGoForward}
        onPress={() => onChangeMonth(1)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.monthNav,
          !canGoForward && styles.monthNavDisabled,
          pressed && canGoForward && styles.monthNavPressed,
        ]}
      >
        <Ionicons
          name="chevron-forward"
          size={20}
          color={canGoForward ? theme.colors.primary : theme.colors.muted}
        />
      </Pressable>
    </View>
  );

  const errorMessage =
    query.isError && query.error instanceof Error
      ? query.error.message
      : query.isError
        ? 'No se pudo cargar el historial.'
        : null;

  if (query.isPending) {
    return (
      <ScreenContainer contentContainerStyle={styles.screenBody}>
        {monthHeader}
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.muted}>Cargando historial…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (query.isError) {
    return (
      <ScreenContainer contentContainerStyle={styles.screenBody}>
        {monthHeader}
        <View style={styles.centered}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            onPress={() => void query.refetch()}
          >
            <Text style={styles.retryLabel}>Reintentar</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.screenBody}>
      {monthHeader}
      <SectionList<DeliveryHistoryItem, HistorySection>
        sections={sections}
        keyExtractor={keyExtractor}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={
          sections.length === 0 ? styles.listEmpty : styles.listContent
        }
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isPending}
            onRefresh={() =>
              void queryClient.invalidateQueries({ queryKey: ['delivery', 'history', month] })
            }
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="archive-outline"
              size={36}
              color={theme.colors.muted}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyTitle}>Sin entregas este mes</Text>
            <Text style={styles.emptyHint}>
              Cuando cierres una entrega, la vas a ver acá agrupada por día.
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    screenBody: {
      flexGrow: 1,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: spacing.xl,
    },
    listEmpty: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      gap: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.sm,
    },
    monthNav: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthNavDisabled: {
      opacity: 0.4,
    },
    monthNavPressed: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
    monthLabelWrapper: {
      flex: 1,
      alignItems: 'center',
    },
    monthLabel: {
      ...typography.subtitle,
      color: colors.text,
    },
    monthSummary: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 2,
    },
    sectionHeader: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.sm,
    },
    sectionHeaderPressed: {
      opacity: motion.pressOpacitySoft,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    sectionHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitle: {
      ...typography.subtitle,
      color: colors.text,
    },
    sectionSummary: {
      ...typography.caption,
      color: colors.muted,
      marginTop: 2,
    },
    itemCard: {
      marginBottom: spacing.md,
    },
    itemHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    itemTracking: {
      ...typography.bodyStrong,
      color: colors.text,
      flex: 1,
      minWidth: 0,
    },
    itemAddress: {
      ...typography.body,
      color: colors.muted,
      marginTop: spacing.xs,
    },
    itemMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    itemMetaText: {
      ...typography.caption,
      color: colors.muted,
    },
    statusBadge: {
      flexShrink: 0,
      maxWidth: '45%',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
      borderRadius: spacing.radiusMd,
      borderWidth: StyleSheet.hairlineWidth,
    },
    statusBadgeText: {
      ...typography.captionStrong,
      textAlign: 'center',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    muted: {
      ...typography.caption,
      color: colors.muted,
    },
    error: {
      ...typography.body,
      color: colors.danger,
      textAlign: 'center',
    },
    retry: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.primary,
      borderRadius: spacing.radiusLg,
    },
    retryPressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
    retryLabel: {
      ...typography.bodyStrong,
      color: colors.primaryOn,
    },
    emptyState: {
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    emptyIcon: {
      marginBottom: spacing.md,
    },
    emptyTitle: {
      ...typography.subtitle,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    emptyHint: {
      ...typography.body,
      color: colors.muted,
      textAlign: 'center',
    },
  });
}
