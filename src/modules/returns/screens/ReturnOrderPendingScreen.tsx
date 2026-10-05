import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, ScreenContainer } from '@components/ui';
import { formatShortWeekday, formatTimeRange } from '@modules/pickups/lib/formatSchedule';
import type { ReturnStackParamList } from '@navigation/returnStackTypes';
import { useTheme, type AppTheme } from '@theme';

import {
  useAcceptReturnOrder,
  useRejectReturnOrder,
  useReturnOrder,
} from '../hooks/useReturnOrders';
import { RETURN_ORDER_STATUS_LABEL } from '../lib/returnOrderStatus';

type Props = NativeStackScreenProps<ReturnStackParamList, 'ReturnOrderPending'>;

export function ReturnOrderPendingScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const query = useReturnOrder(orderId);
  const acceptMutation = useAcceptReturnOrder();
  const rejectMutation = useRejectReturnOrder();

  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const order = query.data;

  // Si llega acá con la orden ya aceptada (refresh, otro dispositivo), lo que
  // toca es arrancar el recorrido, no volver a decidir.
  useEffect(() => {
    if (!order) return;
    if (
      order.status === 'accepted' ||
      order.status === 'in_progress' ||
      order.status === 'returning_to_warehouse'
    ) {
      navigation.replace('ReturnOrderInProgress', { orderId: order.id });
    }
  }, [order, navigation]);

  async function handleAccept() {
    if (!order) return;
    try {
      await acceptMutation.mutateAsync(order.id);
      navigation.replace('ReturnOrderInProgress', { orderId: order.id });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo aceptar la devolución.');
    }
  }

  async function handleReject() {
    if (!order) return;
    if (!rejectReason.trim()) {
      Alert.alert('Motivo requerido', 'Escribí por qué la rechazás.');
      return;
    }
    try {
      await rejectMutation.mutateAsync({ orderId: order.id, reason: rejectReason.trim() });
      Alert.alert('Devolución rechazada', 'Ya avisamos al depósito.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo rechazar la devolución.');
    }
  }

  if (query.isLoading || !order) {
    return (
      <ScreenContainer>
        <Text style={{ color: theme.colors.muted, padding: 16 }}>Cargando…</Text>
      </ScreenContainer>
    );
  }

  const totalBultos = order.stops.reduce((acc, s) => acc + s.shipments.length, 0);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.badge}>{RETURN_ORDER_STATUS_LABEL[order.status]}</Text>
          <Text style={styles.title}>{order.business?.name ?? 'Devolución'}</Text>
          <Text style={styles.dateLabel}>{formatShortWeekday(order.scheduled_date)}</Text>
          {formatTimeRange(order.scheduled_time_from, order.scheduled_time_to) ? (
            <Text style={styles.muted}>
              {formatTimeRange(order.scheduled_time_from, order.scheduled_time_to)}
            </Text>
          ) : null}
          <Text style={styles.muted}>Salís de: {order.crossdocking_location?.name ?? '—'}</Text>
          <Text style={styles.muted}>
            {totalBultos} bulto{totalBultos === 1 ? '' : 's'} a devolver
          </Text>
          {order.notes ? <Text style={styles.notes}>{order.notes}</Text> : null}
        </Card>

        <Text style={styles.sectionTitle}>Paradas ({order.stops.length})</Text>
        {order.stops.map((stop) => (
          <Card key={stop.id} style={{ marginBottom: 8 }}>
            <Text style={styles.stopTitle}>
              {stop.sequence}. {stop.warehouse?.name ?? stop.warehouse_id}
            </Text>
            {stop.warehouse?.address ? (
              <Text style={styles.stopAddress}>{stop.warehouse.address}</Text>
            ) : null}
            <Text style={styles.stopAddress}>
              {stop.shipments.length} bulto{stop.shipments.length === 1 ? '' : 's'}
            </Text>
          </Card>
        ))}

        {rejecting ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>¿Por qué la rechazás?</Text>
            <TextInput
              style={styles.input}
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Motivo…"
              placeholderTextColor={theme.colors.muted}
            />
            <View style={styles.actions}>
              <Button
                variant="ghost"
                onPress={() => {
                  setRejecting(false);
                  setRejectReason('');
                }}
              >
                Cancelar
              </Button>
              <Button variant="danger" onPress={handleReject} disabled={rejectMutation.isPending}>
                {rejectMutation.isPending ? 'Enviando…' : 'Confirmar rechazo'}
              </Button>
            </View>
          </Card>
        ) : (
          <View style={styles.actions}>
            <Button variant="primary" onPress={handleAccept} disabled={acceptMutation.isPending}>
              {acceptMutation.isPending ? 'Aceptando…' : 'Aceptar'}
            </Button>
            <Button
              variant="ghost"
              onPress={() => setRejecting(true)}
              disabled={acceptMutation.isPending}
            >
              Rechazar
            </Button>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
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
    title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
    dateLabel: { fontSize: 15, color: theme.colors.muted, marginTop: 4, fontWeight: '500' },
    muted: { fontSize: 14, color: theme.colors.muted, marginTop: 4 },
    notes: {
      marginTop: 8,
      fontSize: 14,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 8,
      borderRadius: 6,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: 8,
      marginBottom: 8,
    },
    stopTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
    stopAddress: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
    input: {
      minHeight: 80,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 8,
      padding: 10,
      textAlignVertical: 'top',
    },
    actions: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  });
}
