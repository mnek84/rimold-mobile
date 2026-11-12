import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  type SectionListRenderItem,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, IconButton, ScreenContainer, StatusBadge } from '@components/ui';
import type { ColectaStackParamList } from '@navigation/colectaStackTypes';
import { useTheme, type AppTheme } from '@theme';

import { useMyPickupOrders } from '../hooks/usePickupOrders';
import { formatShortDate, formatTimeRange } from '../lib/formatSchedule';
import {
  PICKUP_ORDER_STATUS_LABEL,
  isTerminalOrderStatus,
} from '../lib/pickupOrderStatus';
import { PICKUP_ORDER_STATUS_PRESENTATION } from '../lib/pickupStatusTone';
import { usePickupOrderActiveStore } from '../store/pickupOrderActiveStore';
import type { PickupOrder } from '../types';

type Props = NativeStackScreenProps<ColectaStackParamList, 'PickupOrdersList'>;

type Section = { title: string; data: PickupOrder[] };

function toDateOnly(s: string): string {
  return s.slice(0, 10);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupOrders(orders: PickupOrder[]): Section[] {
  const today = todayIso();
  const active: PickupOrder[] = [];
  const todays: PickupOrder[] = [];
  const upcoming: PickupOrder[] = [];
  for (const o of orders) {
    if (isTerminalOrderStatus(o.status)) continue;
    if (o.status === 'in_progress' || o.status === 'returning_to_warehouse') {
      active.push(o);
      continue;
    }
    if (toDateOnly(o.scheduled_date) === today) {
      todays.push(o);
    } else {
      upcoming.push(o);
    }
  }
  const sections: Section[] = [];
  if (active.length) sections.push({ title: 'En curso', data: active });
  if (todays.length) sections.push({ title: 'Hoy', data: todays });
  if (upcoming.length) sections.push({ title: 'Próximas', data: upcoming });
  return sections;
}

export function PickupOrdersListScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const query = useMyPickupOrders();
  const activeOrderId = usePickupOrderActiveStore((s) => s.activeOrderId);

  const orders = query.data ?? [];
  const sections = useMemo(() => groupOrders(orders), [orders]);

  // Restaurar recorrido si quedó una orden activa cuando entramos a esta pantalla.
  // Se usa useFocusEffect (no useEffect) para no re-navegar cada vez que las
  // órdenes se refetch en background — si el chofer ya navegó a InProgress o al
  // scanner, esta pantalla queda debajo del stack sin foco y no debe robarle el
  // foco al scanner con cada invalidación de queries.
  useFocusEffect(
    useCallback(() => {
      if (!activeOrderId) return;
      const active = orders.find((o) => o.id === activeOrderId);
      if (
        active &&
        (active.status === 'in_progress' || active.status === 'returning_to_warehouse')
      ) {
        navigation.navigate('PickupOrderInProgress', { orderId: active.id });
      }
    }, [activeOrderId, navigation, orders]),
  );

  function renderItem({ item }: { item: PickupOrder }) {
    return (
      <Pressable
        onPress={() => {
          // Sólo la orden aún sin aceptar va a la pantalla de Aceptar/Rechazar.
          // Una vez aceptada, el chofer va directo al recorrido: ahí está el
          // botón "Iniciar recorrido" y el resto de la máquina de estados.
          if (item.status === 'pending') {
            navigation.navigate('PickupOrderPending', { orderId: item.id });
          } else {
            navigation.navigate('PickupOrderInProgress', { orderId: item.id });
          }
        }}
        accessibilityRole="button"
        style={({ pressed }) => pressed && styles.cardPressed}
      >
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.timeHero}>
                {formatTimeRange(item.scheduled_time_from, item.scheduled_time_to) || '—'}
              </Text>
              <Text style={styles.subtitle}>
                {formatShortDate(item.scheduled_date)} · {item.stops.length} parada
                {item.stops.length === 1 ? '' : 's'} · destino{' '}
                {item.crossdocking_location?.name ?? '—'}
              </Text>
            </View>
            <StatusBadge
              label={PICKUP_ORDER_STATUS_LABEL[item.status]}
              tone={PICKUP_ORDER_STATUS_PRESENTATION[item.status].tone}
              icon={PICKUP_ORDER_STATUS_PRESENTATION[item.status].icon}
            />
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis colectas</Text>
        <IconButton
          icon="time-outline"
          accessibilityLabel="Ver historial de colectas"
          onPress={() => navigation.navigate('PickupOrdersHistory')}
        />
      </View>

      {query.isLoading && orders.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No tenés colectas pendientes.
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching && !query.isLoading}
              onRefresh={() => {
                void query.refetch();
              }}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  const { colors, spacing, typography, motion } = theme;
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    headerTitle: {
      ...typography.title,
      color: colors.text,
    },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    flex: { flex: 1 },
    listContent: { paddingBottom: spacing.xl },
    sectionTitle: {
      ...typography.captionStrong,
      color: colors.muted,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: { marginHorizontal: spacing.lg, marginVertical: spacing.xs + 2 },
    cardPressed: { opacity: motion.pressOpacitySoft },
    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    title: { ...typography.bodyStrong, color: colors.text },
    timeHero: {
      ...typography.title,
      color: colors.text,
      letterSpacing: -0.3,
      fontVariant: ['tabular-nums'],
    },
    subtitle: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
    empty: {
      ...typography.body,
      textAlign: 'center',
      color: colors.muted,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
    },
  });
}
