import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
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
  fetchColectaHistory,
  type ColectaHistoryDay,
  type ColectaHistoryItem,
} from '@modules/colecta/api/colectaHistory';
import type { ColectaStackParamList } from '@navigation/colectaStackTypes';
import { useTheme, type AppTheme } from '@theme';

type Props = NativeStackScreenProps<ColectaStackParamList, 'ColectaHistory'>;

type HistorySection = {
  title: string;
  totalItems: number;
  totalCollections: number;
  data: ColectaHistoryItem[];
};

const COLECTA_HISTORY_QUERY_KEY = ['colecta', 'history'] as const;
const STAGGER_MS = 28;
const MAX_STAGGER_INDEX = 18;

/** Formatea "2026-06-05" a "vie 5 jun 2026" (es-AR). Cae a la cadena original ante errores. */
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
      year: 'numeric',
    });
    const out = formatter.format(date).replace(/\./g, '');
    return out.charAt(0).toUpperCase() + out.slice(1);
  } catch {
    return isoDate;
  }
}

function formatFinishedAtTime(iso: string): string {
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

function pluralPaquetes(n: number): string {
  return n === 1 ? '1 paquete' : `${n} paquetes`;
}

function pluralColectas(n: number): string {
  return n === 1 ? '1 colecta' : `${n} colectas`;
}

export function ColectaHistoryScreen(_props: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: COLECTA_HISTORY_QUERY_KEY,
    queryFn: ({ signal }) => fetchColectaHistory({ signal }),
    staleTime: 30_000,
  });

  const sections = useMemo<HistorySection[]>(() => {
    const days: ColectaHistoryDay[] = query.data ?? [];
    return days.map((day) => ({
      title: day.date,
      totalItems: day.totalItems,
      totalCollections: day.totalCollections,
      data: day.collections,
    }));
  }, [query.data]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: HistorySection }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{formatDayLabel(section.title)}</Text>
        <Text style={styles.sectionSummary}>
          {pluralColectas(section.totalCollections)} · {pluralPaquetes(section.totalItems)}
        </Text>
      </View>
    ),
    [styles.sectionHeader, styles.sectionSummary, styles.sectionTitle],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ColectaHistoryItem; index: number }) => {
      const delay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS;
      const time = formatFinishedAtTime(item.finishedAt);
      const card = (
        <Card padding="md" style={styles.itemCard}>
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemClient} numberOfLines={1}>
              {item.businessName ?? 'Cliente desconocido'}
            </Text>
            <View style={styles.itemQtyChip}>
              <Ionicons name="cube-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.itemQtyText}>{item.totalItems}</Text>
            </View>
          </View>
          {item.warehouseName != null && item.warehouseName !== '' ? (
            <Text style={styles.itemWarehouse} numberOfLines={1}>
              {item.warehouseName}
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
      styles.itemCard,
      styles.itemClient,
      styles.itemHeaderRow,
      styles.itemMetaRow,
      styles.itemMetaText,
      styles.itemQtyChip,
      styles.itemQtyText,
      styles.itemWarehouse,
      theme.colors.muted,
      theme.colors.primary,
    ],
  );

  const keyExtractor = useCallback((item: ColectaHistoryItem) => item.id, []);

  const errorMessage =
    query.isError && query.error instanceof Error
      ? query.error.message
      : query.isError
        ? 'No se pudo cargar el historial.'
        : null;

  if (query.isPending) {
    return (
      <ScreenContainer contentContainerStyle={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.muted}>Cargando colectas…</Text>
      </ScreenContainer>
    );
  }

  if (query.isError) {
    return (
      <ScreenContainer contentContainerStyle={styles.centered}>
        <Text style={styles.error}>{errorMessage}</Text>
        <Pressable
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          onPress={() => void query.refetch()}
        >
          <Text style={styles.retryLabel}>Reintentar</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentContainerStyle={styles.screenBody}>
      <SectionList<ColectaHistoryItem, HistorySection>
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
              void queryClient.invalidateQueries({ queryKey: COLECTA_HISTORY_QUERY_KEY })
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
            <Text style={styles.emptyTitle}>Aún no hay colectas finalizadas</Text>
            <Text style={styles.emptyHint}>
              Cuando cierres una colecta, vas a verla acá agrupada por día.
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
    sectionHeader: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: spacing.sm,
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
    itemClient: {
      ...typography.bodyStrong,
      color: colors.text,
      flex: 1,
    },
    itemQtyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primary,
      borderRadius: spacing.radiusSm,
    },
    itemQtyText: {
      ...typography.captionStrong,
      color: colors.primary,
    },
    itemWarehouse: {
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
