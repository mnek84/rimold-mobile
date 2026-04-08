import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Input, ScreenContainer } from '@components/ui';
import { fetchClientsPage } from '@core/api/clients';
import { isValidLatLng } from '@core/geo/coordinates';
import { useUserLocation } from '@hooks/useUserLocation';
import type { ColectaClient } from '@modules/colecta/types';
import { useColectaSelectionStore } from '@modules/colecta/colectaSelectionStore';
import {
  colectaSessionConflictsWith,
  useColectaSessionStore,
} from '@modules/colecta/colectaSessionStore';
import { formatWarehouseDistanceLabel } from '@modules/colecta/formatWarehouseDistanceLabel';
import { sortClientsWarehousesByUserDistance } from '@modules/colecta/sortWarehousesByUserDistance';
import type { ColectaStackParamList } from '@navigation/colectaStackTypes';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

import type { ColectaWarehouse } from './types';

type Props = NativeStackScreenProps<ColectaStackParamList, 'ClientSelection'>;

type WarehouseRow = { kind: 'warehouse'; client: ColectaClient; warehouse: ColectaWarehouse };
type EmptyRow = { kind: 'empty'; client: ColectaClient };
type SectionRow = WarehouseRow | EmptyRow;

type ClientSection = {
  title: string;
  sectionIndex: number;
  data: SectionRow[];
};

const MAX_STAGGER_INDEX = 22;
const STAGGER_MS = 34;
const CLIENTS_PER_PAGE = 25;
const SEARCH_DEBOUNCE_MS = 350;

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function ClientSelectionScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [query, setQuery] = useState('');
  const debouncedSearch = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const queryClient = useQueryClient();

  const infinite = useInfiniteQuery({
    queryKey: ['clients', debouncedSearch] as const,
    queryFn: ({ pageParam }) =>
      fetchClientsPage({
        search: debouncedSearch,
        page: pageParam as number,
        per_page: CLIENTS_PER_PAGE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.current_page < lastPage.last_page ? lastPage.current_page + 1 : undefined,
    staleTime: 60_000,
  });

  const isPending = infinite.isPending;
  const isError = infinite.isError;
  const error = infinite.error;

  const { latitude: userLat, longitude: userLng, loading: locationLoading, isFallback } =
    useUserLocation();

  /** Real GPS only — no fallback coords for ranking or distances. */
  const canUseRealLocation =
    !locationLoading && !isFallback && userLat !== null && userLng !== null;

  const sortByDistance = canUseRealLocation;

  const clients = useMemo(() => {
    const flat = infinite.data?.pages.flatMap((p) => p.data) ?? [];
    return sortClientsWarehousesByUserDistance(flat, userLat, userLng, sortByDistance);
  }, [infinite.data?.pages, userLat, userLng, sortByDistance]);

  const animEpochRef = useRef(0);
  const [animEpoch, setAnimEpoch] = useState(0);
  const bumpAnimEpoch = useCallback(() => {
    animEpochRef.current += 1;
    setAnimEpoch(animEpochRef.current);
  }, []);

  const didInitialListAnim = useRef(false);
  useEffect(() => {
    if (isPending || isError || didInitialListAnim.current) {
      return;
    }
    didInitialListAnim.current = true;
    bumpAnimEpoch();
  }, [isPending, isError, bumpAnimEpoch]);

  const didSortRevealAnim = useRef(false);
  useEffect(() => {
    if (!sortByDistance || didSortRevealAnim.current) {
      return;
    }
    didSortRevealAnim.current = true;
    bumpAnimEpoch();
  }, [sortByDistance, bumpAnimEpoch]);

  const closestWarehouseIdByClientId = useMemo(() => {
    const m = new Map<string, string>();
    if (!sortByDistance) {
      return m;
    }
    for (const c of clients) {
      const firstLocated = c.warehouses.find((w) => isValidLatLng(w.latitude, w.longitude));
      if (firstLocated) {
        m.set(c.id, firstLocated.id);
      }
    }
    return m;
  }, [clients, sortByDistance]);

  const sections = useMemo((): ClientSection[] => {
    return clients.map((client, sectionIndex) => ({
      title: client.name,
      sectionIndex,
      data:
        client.warehouses.length > 0
          ? client.warehouses.map(
              (warehouse): SectionRow => ({ kind: 'warehouse', client, warehouse }),
            )
          : [{ kind: 'empty', client }],
    }));
  }, [clients]);

  const setColectaSelection = useColectaSelectionStore((s) => s.setSelection);
  const startNewColectaSession = useColectaSessionStore((s) => s.startNewSession);

  const onSelectWarehouse = useCallback(
    (client: ColectaClient, warehouse: ColectaWarehouse) => {
      const payload = {
        clientId: client.id,
        clientName: client.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
      };

      if (colectaSessionConflictsWith(payload)) {
        const s = useColectaSessionStore.getState();
        Alert.alert(
          'Colecta en curso',
          `Ya tenés una sesión abierta en ${s.clientName} — ${s.warehouseName}. Finalizala antes de iniciar otra, o volvé a esa colecta.`,
          [
            {
              text: 'Ir a la colecta abierta',
              onPress: () => {
                setColectaSelection({
                  clientId: s.clientId,
                  clientName: s.clientName,
                  warehouseId: s.warehouseId,
                  warehouseName: s.warehouseName,
                });
                navigation.navigate('ColectaScan', {
                  clientId: s.clientId,
                  clientName: s.clientName,
                  warehouseId: s.warehouseId,
                  warehouseName: s.warehouseName,
                });
              },
            },
            { text: 'Cancelar', style: 'cancel' },
          ],
        );
        return;
      }

      const sess = useColectaSessionStore.getState();
      const sameOpenSession =
        sess.collectionId != null &&
        sess.clientId === payload.clientId &&
        sess.warehouseId === payload.warehouseId;

      if (!sameOpenSession) {
        startNewColectaSession(payload);
      }

      setColectaSelection(payload);
      navigation.navigate('ColectaScan', payload);
    },
    [navigation, setColectaSelection, startNewColectaSession],
  );

  const errorMessage =
    isError && error instanceof Error ? error.message : isError ? 'No se pudieron cargar los clientes.' : null;

  const renderSectionHeader = useCallback(
    ({ section }: { section: ClientSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    ),
    [styles.sectionHeader, styles.sectionTitle],
  );

  const globalIndexFor = useCallback((section: ClientSection, itemIndex: number) => {
    let offset = 0;
    for (const s of sections) {
      if (s.sectionIndex === section.sectionIndex) {
        break;
      }
      offset += s.data.length;
    }
    return offset + itemIndex;
  }, [sections]);

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: SectionRow;
      index: number;
      section: ClientSection;
    }) => {
      if (item.kind === 'empty') {
        const g = globalIndexFor(section, index);
        const delay = Math.min(g, MAX_STAGGER_INDEX) * STAGGER_MS;
        const inner = (
          <Card padding="md" style={styles.warehouseCard}>
            <Text style={styles.emptyWarehousesText}>Sin depósitos configurados.</Text>
          </Card>
        );
        if (Platform.OS === 'web') {
          return <View key={`${animEpoch}-empty-${item.client.id}`}>{inner}</View>;
        }
        return (
          <Animated.View
            key={`${animEpoch}-empty-${item.client.id}`}
            entering={FadeInDown.duration(260).delay(delay)}
          >
            {inner}
          </Animated.View>
        );
      }

      const { client, warehouse } = item;
      const isClosest = closestWarehouseIdByClientId.get(client.id) === warehouse.id;
      const showDistanceRow = sortByDistance;
      const distanceText = showDistanceRow
        ? formatWarehouseDistanceLabel(warehouse, userLat, userLng)
        : null;
      const distanceMuted =
        showDistanceRow && (distanceText === 'Sin ubicación' || distanceText === '—');

      const g = globalIndexFor(section, index);
      const delay = Math.min(g, MAX_STAGGER_INDEX) * STAGGER_MS;

      const card = (
        <Card
          padding="md"
          onPress={() => onSelectWarehouse(client, warehouse)}
          style={[styles.warehouseCard, isClosest && styles.warehouseCardClosest]}
        >
          {isClosest ? (
            <View style={styles.closestBadge}>
              <Text style={styles.closestBadgeText}>Más cercano</Text>
            </View>
          ) : null}
          <Text style={styles.warehouseName}>{warehouse.name}</Text>
          {warehouse.address != null && warehouse.address.trim() !== '' ? (
            <Text style={styles.warehouseAddress} numberOfLines={3}>
              {warehouse.address}
            </Text>
          ) : null}
          {showDistanceRow && distanceText != null ? (
            <View style={styles.distanceRow}>
              <Text style={styles.distanceLabel}>Distancia</Text>
              <Text style={[styles.distanceValue, distanceMuted && styles.distanceValueMuted]}>
                {distanceText}
              </Text>
            </View>
          ) : null}
        </Card>
      );

      if (Platform.OS === 'web') {
        return <View key={`${animEpoch}-${warehouse.id}`}>{card}</View>;
      }

      return (
        <Animated.View key={`${animEpoch}-${warehouse.id}`} entering={FadeInDown.duration(260).delay(delay)}>
          {card}
        </Animated.View>
      );
    },
    [
      animEpoch,
      closestWarehouseIdByClientId,
      globalIndexFor,
      onSelectWarehouse,
      sortByDistance,
      styles,
      userLat,
      userLng,
    ],
  );

  const keyExtractor = useCallback((item: SectionRow) => {
    if (item.kind === 'empty') {
      return `empty-${item.client.id}`;
    }
    return item.warehouse.id;
  }, []);

  return (
    <ScreenContainer contentContainerStyle={styles.screenBody}>
      <View style={styles.searchWrap}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar cliente…"
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.searchInput}
        />
      </View>

      {isPending ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.muted}>Cargando clientes…</Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            onPress={() => void infinite.refetch()}
          >
            <Text style={styles.retryLabel}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList<SectionRow, ClientSection>
          sections={sections}
          keyExtractor={keyExtractor}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={sections.length === 0 ? styles.listEmpty : styles.listContent}
          stickySectionHeadersEnabled={false}
          onEndReached={() => {
            if (infinite.hasNextPage && !infinite.isFetchingNextPage) {
              void infinite.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.35}
          refreshControl={
            <RefreshControl
              refreshing={
                infinite.isFetching && !infinite.isPending && !infinite.isFetchingNextPage
              }
              onRefresh={() =>
                void queryClient.invalidateQueries({ queryKey: ['clients', debouncedSearch] })
              }
              tintColor={theme.colors.primary}
            />
          }
          ListFooterComponent={
            infinite.isFetchingNextPage ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {debouncedSearch.trim() !== ''
                ? 'Ningún cliente coincide con la búsqueda.'
                : 'No hay clientes disponibles.'}
            </Text>
          }
        />
      )}
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    screenBody: {
      flexGrow: 1,
    },
    searchWrap: {
      paddingBottom: spacing.md,
    },
    searchInput: {
      marginBottom: 0,
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
    footerLoading: {
      paddingVertical: spacing.lg,
      alignItems: 'center',
    },
    sectionHeader: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: borderSubtle,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.subtitle,
      color: colors.text,
    },
    warehouseCard: {
      marginBottom: spacing.md,
    },
    warehouseCardClosest: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: 'rgba(37, 99, 235, 0.08)',
    },
    closestBadge: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(37, 99, 235, 0.22)',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: spacing.radiusSm,
      marginBottom: spacing.sm,
    },
    closestBadgeText: {
      ...typography.captionStrong,
      color: colors.primary,
      letterSpacing: 0.2,
    },
    warehouseName: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    warehouseAddress: {
      ...typography.body,
      color: colors.muted,
      marginTop: spacing.xs,
    },
    distanceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: borderSubtle,
    },
    distanceLabel: {
      ...typography.caption,
      color: colors.muted,
    },
    distanceValue: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
    distanceValueMuted: {
      ...typography.caption,
      color: colors.muted,
      fontWeight: '400',
    },
    emptyWarehousesText: {
      ...typography.body,
      color: colors.muted,
      fontStyle: 'italic',
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
      color: colors.text,
    },
    empty: {
      ...typography.body,
      color: colors.muted,
      textAlign: 'center',
    },
  });
}
