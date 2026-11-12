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

import { Card, ScreenContainer, StatusBadge } from '@components/ui';
import type { ReturnStackParamList } from '@navigation/returnStackTypes';
import { useTheme, type AppTheme } from '@theme';

import { useMyReturnOrders } from '../hooks/useReturnOrders';
import { formatShortWeekday } from '@modules/pickups/lib/formatSchedule';
import { RETURN_ORDER_STATUS_LABEL, isTerminalOrderStatus } from '../lib/returnOrderStatus';
import { RETURN_ORDER_STATUS_PRESENTATION } from '../lib/returnStatusTone';
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
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        {orders.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="return-down-back-outline" size={40} color={theme.colors.muted} />
            <Text style={styles.empty}>No tenés devoluciones asignadas.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <Pressable
              key={order.id}
              onPress={() => open(order)}
              accessibilityRole="button"
              style={({ pressed }) => pressed && styles.cardPressed}
            >
              <Card style={styles.card}>
                <StatusBadge
                  label={RETURN_ORDER_STATUS_LABEL[order.status]}
                  tone={RETURN_ORDER_STATUS_PRESENTATION[order.status].tone}
                  icon={RETURN_ORDER_STATUS_PRESENTATION[order.status].icon}
                  style={styles.badge}
                />
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
  const { colors, spacing, typography, motion } = theme;
  return StyleSheet.create({
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl + spacing.sm },
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xxl,
      gap: spacing.sm,
    },
    empty: { ...typography.body, color: colors.muted, textAlign: 'center' },
    card: { marginBottom: spacing.md },
    cardPressed: { opacity: motion.pressOpacitySoft },
    badge: { marginBottom: spacing.sm },
    title: { ...typography.subtitle, fontWeight: '700', color: colors.text },
    muted: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
  });
}
