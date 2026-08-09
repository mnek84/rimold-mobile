import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, ScreenContainer } from '@components/ui';
import type { ColectaStackParamList } from '@navigation/colectaStackTypes';
import { useTheme, type AppTheme } from '@theme';

import { useMyPickupOrders } from '../hooks/usePickupOrders';
import {
  PICKUP_ORDER_STATUS_LABEL,
  isTerminalOrderStatus,
} from '../lib/pickupOrderStatus';
import type { PickupOrder, PickupOrderStatus } from '../types';

type Props = NativeStackScreenProps<ColectaStackParamList, 'PickupOrdersHistory'>;

type Section = { title: string; data: PickupOrder[] };

function formatDayLabel(isoDate: string): string {
  try {
    const [yy, mm, dd] = isoDate.slice(0, 10).split('-').map((n) => Number.parseInt(n, 10));
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return isoDate;
    const date = new Date(yy, mm - 1, dd);
    const out = new Intl.DateTimeFormat('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
      .format(date)
      .replace(/\./g, '');
    return out.charAt(0).toUpperCase() + out.slice(1);
  } catch {
    return isoDate;
  }
}

function terminalTimestamp(o: PickupOrder): string | null {
  if (o.status === 'completed') return o.completed_at;
  if (o.status === 'cancelled') return o.cancelled_at;
  if (o.status === 'rejected') return o.rejected_at;
  return null;
}

function formatTime(iso: string | null): string {
  if (iso == null || iso === '') return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return '';
  }
}

function groupByDayDesc(orders: PickupOrder[]): Section[] {
  const byDay = new Map<string, PickupOrder[]>();
  for (const o of orders) {
    const key = o.scheduled_date.slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(o);
    else byDay.set(key, [o]);
  }
  const keys = Array.from(byDay.keys()).sort((a, b) => (a < b ? 1 : -1));
  return keys.map((k) => {
    const items = byDay.get(k)!.slice().sort((a, b) => {
      const ta = terminalTimestamp(a) ?? a.scheduled_time_from ?? '';
      const tb = terminalTimestamp(b) ?? b.scheduled_time_from ?? '';
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    return { title: k, data: items };
  });
}

const STATUS_TONE: Record<Extract<PickupOrderStatus, 'completed' | 'cancelled' | 'rejected'>, 'ok' | 'warn' | 'danger'> = {
  completed: 'ok',
  cancelled: 'warn',
  rejected: 'danger',
};

export function PickupOrdersHistoryScreen(_props: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const query = useMyPickupOrders();

  const sections = useMemo<Section[]>(() => {
    const terminals = (query.data ?? []).filter((o) => isTerminalOrderStatus(o.status));
    return groupByDayDesc(terminals);
  }, [query.data]);

  const completedStopsCount = (o: PickupOrder): number =>
    o.stops.filter((s) => s.status === 'completed').length;

  if (query.isLoading && (query.data ?? []).length === 0) {
    return (
      <ScreenContainer contentContainerStyle={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.muted}>Cargando historial…</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <SectionList<PickupOrder, Section>
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{formatDayLabel(section.title)}</Text>
            <Text style={styles.sectionSummary}>
              {section.data.length} colecta{section.data.length === 1 ? '' : 's'}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const completed = completedStopsCount(item);
          const total = item.stops.length;
          const time = formatTime(terminalTimestamp(item)) || item.scheduled_time_from || '';
          const tone =
            item.status === 'completed' || item.status === 'cancelled' || item.status === 'rejected'
              ? STATUS_TONE[item.status]
              : 'warn';
          return (
            <Card style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.crossdocking_location?.name ?? 'Destino desconocido'}
                  </Text>
                  <Text style={styles.subtitle}>
                    {completed}/{total} paradas{time ? ` · ${time}` : ''}
                  </Text>
                  {item.cancel_reason ? (
                    <Text style={styles.reason} numberOfLines={2}>
                      Motivo: {item.cancel_reason}
                    </Text>
                  ) : null}
                  {item.reject_reason ? (
                    <Text style={styles.reason} numberOfLines={2}>
                      Motivo: {item.reject_reason}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.badge, styles[`badge_${tone}` as const]]}>
                  <Text style={[styles.badgeText, styles[`badgeText_${tone}` as const]]}>
                    {PICKUP_ORDER_STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }}
        contentContainerStyle={
          sections.length === 0 ? styles.listEmpty : styles.listContent
        }
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isLoading}
            onRefresh={() => query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="archive-outline" size={36} color={theme.colors.muted} />
            <Text style={styles.emptyTitle}>Aún no hay colectas cerradas</Text>
            <Text style={styles.emptyHint}>
              Cuando termines, canceles o rechaces una colecta la vas a ver acá.
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  const { colors, spacing, typography } = theme;
  return StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    muted: { ...typography.caption, color: colors.muted },
    listContent: { paddingBottom: spacing.xl, paddingHorizontal: 16 },
    listEmpty: { flexGrow: 1, justifyContent: 'center' },
    sectionHeader: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.sm,
    },
    sectionTitle: { ...typography.subtitle, color: colors.text },
    sectionSummary: { ...typography.caption, color: colors.muted, marginTop: 2 },
    card: { marginVertical: 6 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontSize: 16, fontWeight: '600', color: colors.text },
    subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
    reason: { fontSize: 12, color: colors.muted, marginTop: 4, fontStyle: 'italic' },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted ?? '#e5e7eb',
    },
    badge_ok: { backgroundColor: colors.surfaceMuted ?? '#e5e7eb' },
    badge_warn: { backgroundColor: colors.surfaceMuted ?? '#e5e7eb' },
    badge_danger: { backgroundColor: colors.surfaceMuted ?? '#e5e7eb' },
    badgeText: { fontSize: 12, fontWeight: '500' },
    badgeText_ok: { color: colors.primary },
    badgeText_warn: { color: colors.text },
    badgeText_danger: { color: colors.danger },
    emptyState: {
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      gap: spacing.sm,
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
    },
  });
}
