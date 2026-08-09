import { Ionicons } from '@expo/vector-icons';
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

import { Card, ScreenContainer } from '@components/ui';
import type { ColectaStackParamList } from '@navigation/colectaStackTypes';
import { useTheme, type AppTheme } from '@theme';

import { useMyPickupOrders } from '../hooks/usePickupOrders';
import { formatShortDate, formatTimeRange } from '../lib/formatSchedule';
import {
  PICKUP_ORDER_STATUS_LABEL,
  isTerminalOrderStatus,
} from '../lib/pickupOrderStatus';
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
      >
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.timeHero}>
                {formatTimeRange(item.scheduled_time_from, item.scheduled_time_to) || '—'}
              </Text>
              <Text style={styles.subtitle}>
                {formatShortDate(item.scheduled_date)} · {item.stops.length} parada
                {item.stops.length === 1 ? '' : 's'} · destino{' '}
                {item.crossdocking_location?.name ?? '—'}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{PICKUP_ORDER_STATUS_LABEL[item.status]}</Text>
            </View>
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis colectas</Text>
        <Pressable
          onPress={() => navigation.navigate('PickupOrdersHistory')}
          hitSlop={8}
        >
          <Ionicons name="time-outline" size={22} color={theme.colors.muted} />
        </Pressable>
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
              onRefresh={() => query.refetch()}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          stickySectionHeadersEnabled={false}
        />
      )}
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.text,
    },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.muted,
      paddingHorizontal: 16,
      paddingVertical: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: { marginHorizontal: 16, marginVertical: 6 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
    timeHero: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
      lineHeight: 32,
      letterSpacing: -0.3,
    },
    subtitle: { fontSize: 13, color: theme.colors.muted, marginTop: 4 },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceMuted ?? '#e5e7eb',
    },
    badgeText: { fontSize: 12, color: theme.colors.text, fontWeight: '500' },
    empty: {
      textAlign: 'center',
      color: theme.colors.muted,
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
  });
}
