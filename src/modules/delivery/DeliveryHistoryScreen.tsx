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

import { Button, Card, ScreenContainer } from '@components/ui';
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
  deliveredCount: number;
  notDeliveredCount: number;
  expanded: boolean;
  allShipments: DeliveryHistoryItem[];
  data: DeliveryHistoryItem[];
  /** Índice del primer entregado dentro de `data`; -1 si no hay. Marca dónde va el separador. */
  firstDeliveredIndex: number;
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

/**
 * Resumen de la jornada. Se nombran los dos desenlaces siempre que haya alguno
 * de cada uno: el chofer rinde el día con los dos números, no sólo con el bueno.
 */
function buildOutcomeSummary(delivered: number, notDelivered: number): string {
  const parts: string[] = [];
  if (delivered > 0) {
    parts.push(`${delivered} ${delivered === 1 ? 'entregado' : 'entregados'}`);
  }
  if (notDelivered > 0) {
    parts.push(`${notDelivered} sin entregar`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sin movimientos';
}

/** No entregados primero: son los bultos que el chofer todavía tiene que rendir. */
function sortByOutcomeThenTime(shipments: DeliveryHistoryItem[]): DeliveryHistoryItem[] {
  return [...shipments].sort((a, b) => {
    if (a.outcome !== b.outcome) {
      return a.outcome === 'not_delivered' ? -1 : 1;
    }
    return a.occurredAt.localeCompare(b.occurredAt);
  });
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
      const ordered = sortByOutcomeThenTime(day.shipments);
      return {
        title: day.date,
        deliveredCount: day.deliveredCount,
        notDeliveredCount: day.notDeliveredCount,
        expanded,
        allShipments: ordered,
        data: expanded ? ordered : [],
        firstDeliveredIndex: ordered.findIndex((s) => s.outcome === 'delivered'),
      };
    });
  }, [query.data, expandedDays]);

  const monthTotals = useMemo(() => {
    const days = query.data?.days ?? [];
    let delivered = 0;
    let notDelivered = 0;
    for (const d of days) {
      delivered += d.deliveredCount;
      notDelivered += d.notDeliveredCount;
    }
    return { days: days.length, delivered, notDelivered, total: delivered + notDelivered };
  }, [query.data]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: HistorySection }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: section.expanded }}
        accessibilityLabel={`${formatDayLabel(section.title)}, ${buildOutcomeSummary(section.deliveredCount, section.notDeliveredCount)}, ${section.expanded ? 'expandido' : 'colapsado'}`}
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
              {buildOutcomeSummary(section.deliveredCount, section.notDeliveredCount)}
            </Text>
          </View>
          {section.notDeliveredCount > 0 ? (
            <View style={styles.sectionAlertDot}>
              <Text style={styles.sectionAlertDotText}>{section.notDeliveredCount}</Text>
            </View>
          ) : null}
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
      styles.sectionAlertDot,
      styles.sectionAlertDotText,
      theme.colors.muted,
      toggleDay,
    ],
  );

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: DeliveryHistoryItem;
      index: number;
      section: HistorySection;
    }) => {
      const delay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS;
      const time = formatDeliveredAtTime(item.occurredAt);
      const notDelivered = item.outcome === 'not_delivered';
      const badgeKind = shipmentListBadgeKind(item.status);
      const badgeColors = shipmentListBadgeColors(theme, badgeKind);
      const statusLabel = formatDriverShipmentStatusLabel(item.status);
      // El motivo es el dato por el que se abre esta pantalla. Si el backend no
      // lo pudo atribuir a este intento se dice, en vez de dejar el hueco: un
      // renglón vacío se lee como "no hubo motivo".
      const reasonLine = notDelivered
        ? (item.failureReason ?? 'Sin motivo registrado')
        : null;

      // Separador entre los dos bloques del día. Va dentro de renderItem porque
      // SectionList no anida secciones, y partir el día en dos secciones
      // rompería el plegado por día.
      const groupHeader =
        index === 0 && notDelivered
          ? 'No entregados'
          : index === section.firstDeliveredIndex && section.notDeliveredCount > 0
            ? 'Entregados'
            : null;

      const card = (
        <Card padding="md" style={[styles.itemCard, notDelivered && styles.itemCardFailed]}>
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
          {reasonLine !== null ? (
            <View style={styles.reasonRow}>
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={theme.colors.danger}
                style={styles.reasonIcon}
              />
              <View style={styles.reasonTextWrapper}>
                <Text style={styles.reasonText}>{reasonLine}</Text>
                {item.failureNote !== null ? (
                  <Text style={styles.reasonNote}>{item.failureNote}</Text>
                ) : null}
              </View>
            </View>
          ) : null}
          {time !== '' || item.attempt > 1 ? (
            <View style={styles.itemMetaRow}>
              {time !== '' ? (
                <>
                  <Ionicons name="time-outline" size={14} color={theme.colors.muted} />
                  <Text style={styles.itemMetaText}>{time}</Text>
                </>
              ) : null}
              {item.attempt > 1 ? (
                <Text style={styles.itemMetaText}>{`Intento ${item.attempt}`}</Text>
              ) : null}
            </View>
          ) : null}
        </Card>
      );

      const body = (
        <>
          {groupHeader !== null ? (
            <Text style={styles.groupHeader}>{groupHeader}</Text>
          ) : null}
          {card}
        </>
      );

      if (Platform.OS === 'web') {
        return <View key={item.id}>{body}</View>;
      }
      return (
        <Animated.View key={item.id} entering={FadeInDown.duration(220).delay(delay)}>
          {body}
        </Animated.View>
      );
    },
    [
      styles.groupHeader,
      styles.itemAddress,
      styles.itemCard,
      styles.itemCardFailed,
      styles.itemHeaderRow,
      styles.itemMetaRow,
      styles.itemMetaText,
      styles.itemTracking,
      styles.reasonIcon,
      styles.reasonNote,
      styles.reasonRow,
      styles.reasonText,
      styles.reasonTextWrapper,
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
        style={({ pressed }) => [styles.monthNav, pressed && styles.monthNavPressed]}
      >
        <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
      </Pressable>
      <View style={styles.monthLabelWrapper}>
        <Text style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
        {monthTotals.total > 0 ? (
          <Text style={styles.monthSummary}>
            {buildOutcomeSummary(monthTotals.delivered, monthTotals.notDelivered)} en{' '}
            {monthTotals.days === 1 ? '1 día' : `${monthTotals.days} días`}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mes siguiente"
        accessibilityState={{ disabled: !canGoForward }}
        disabled={!canGoForward}
        onPress={() => onChangeMonth(1)}
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
          <Button icon="refresh-outline" onPress={() => void query.refetch()}>
            Reintentar
          </Button>
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
            <Text style={styles.emptyTitle}>Sin actividad este mes</Text>
            <Text style={styles.emptyHint}>
              Cuando cierres una visita —entregada o no— la vas a ver acá, agrupada por día.
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion, touch } = t;
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
      width: touch.min,
      height: touch.min,
      borderRadius: spacing.radiusPill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthNavDisabled: {
      opacity: motion.disabledOpacity,
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
      marginTop: spacing.xxs,
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
      marginTop: spacing.xxs,
    },
    sectionAlertDot: {
      minWidth: 24,
      height: 24,
      paddingHorizontal: spacing.xs + 2,
      borderRadius: spacing.radiusPill,
      backgroundColor: colors.dangerSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionAlertDotText: {
      ...typography.captionStrong,
      color: colors.danger,
      fontVariant: ['tabular-nums'],
    },
    itemCard: {
      marginBottom: spacing.md,
    },
    itemCardFailed: {
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
    },
    groupHeader: {
      ...typography.captionStrong,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
    },
    reasonRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    reasonIcon: {
      marginTop: spacing.xxs,
    },
    reasonTextWrapper: {
      flex: 1,
      minWidth: 0,
    },
    reasonText: {
      ...typography.captionStrong,
      color: colors.danger,
    },
    reasonNote: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.xxs,
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
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: spacing.radiusSm,
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
