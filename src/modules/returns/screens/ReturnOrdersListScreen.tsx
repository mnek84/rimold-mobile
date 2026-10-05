import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, ScreenContainer } from '@components/ui';
import type { ReturnStackParamList } from '@navigation/returnStackTypes';
import { useTheme, type AppTheme } from '@theme';

import { useMyReturnOrders } from '../hooks/useReturnOrders';
import { formatShortWeekday } from '@modules/pickups/lib/formatSchedule';
import { RETURN_ORDER_STATUS_LABEL, isTerminalOrderStatus } from '../lib/returnOrderStatus';
import type { ReturnOrder } from '../types';

type Props = NativeStackScreenProps<ReturnStackParamList, 'ReturnOrdersList'>;

function bultosIn(order: ReturnOrder): number {
  return order.stops.reduce((acc, s) => acc + s.shipments.length, 0);
}

export function ReturnOrdersListScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const query = useMyReturnOrders();

  const orders = useMemo(
    () => (query.data ?? []).filter((o) => !isTerminalOrderStatus(o.status)),
    [query.data],
  );

  function open(order: ReturnOrder) {
    // Una orden que todavía no aceptó va a la pantalla de decisión; el resto,
    // directo al recorrido.
    if (order.status === 'pending' || order.status === 'unassigned') {
      navigation.navigate('ReturnOrderPending', { orderId: order.id });
      return;
    }
    navigation.navigate('ReturnOrderInProgress', { orderId: order.id });
  }

  if (query.isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} />
        }
      >
        {orders.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="return-down-back-outline" size={40} color={theme.colors.muted} />
            <Text style={styles.empty}>No tenés devoluciones asignadas.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <Pressable key={order.id} onPress={() => open(order)}>
              <Card style={{ marginBottom: 10 }}>
                <Text style={styles.badge}>{RETURN_ORDER_STATUS_LABEL[order.status]}</Text>
                <Text style={styles.title}>{order.business?.name ?? 'Devolución'}</Text>
                <Text style={styles.muted}>{formatShortWeekday(order.scheduled_date)}</Text>
                <Text style={styles.muted}>
                  {order.stops.length} parada{order.stops.length === 1 ? '' : 's'} ·{' '}
                  {bultosIn(order)} bulto{bultosIn(order) === 1 ? '' : 's'}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    empty: { color: theme.colors.muted, fontSize: 14, textAlign: 'center' },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.surfaceMuted,
      color: theme.colors.text,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 8,
    },
    title: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    muted: { fontSize: 14, color: theme.colors.muted, marginTop: 4 },
  });
}
