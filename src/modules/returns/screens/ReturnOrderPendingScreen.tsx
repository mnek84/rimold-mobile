import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Input, ScreenContainer, StatusBadge } from '@components/ui';
import { formatShortWeekday, formatTimeRange } from '@modules/pickups/lib/formatSchedule';
import type { ReturnStackParamList } from '@navigation/returnStackTypes';
import { useTheme, type AppTheme } from '@theme';

import {
  useAcceptReturnOrder,
  useRejectReturnOrder,
  useReturnOrder,
} from '../hooks/useReturnOrders';
import { RETURN_ORDER_STATUS_LABEL } from '../lib/returnOrderStatus';
import { RETURN_ORDER_STATUS_PRESENTATION } from '../lib/returnStatusTone';

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
        <Text style={styles.loading}>Cargando…</Text>
      </ScreenContainer>
    );
  }

  const totalBultos = order.stops.reduce((acc, s) => acc + s.shipments.length, 0);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.headerCard}>
          <StatusBadge
            label={RETURN_ORDER_STATUS_LABEL[order.status]}
            tone={RETURN_ORDER_STATUS_PRESENTATION[order.status].tone}
            icon={RETURN_ORDER_STATUS_PRESENTATION[order.status].icon}
            style={styles.badge}
          />
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
          <Card key={stop.id} style={styles.stopCard}>
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
          <Card style={styles.rejectCard}>
            <Text style={styles.sectionTitle}>¿Por qué la rechazás?</Text>
            <Input
              style={styles.input}
              containerStyle={styles.inputContainer}
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Motivo…"
              accessibilityLabel="Motivo del rechazo"
            />
            <View style={styles.actions}>
              <Button
                variant="danger"
                size="lg"
                icon="close-circle-outline"
                onPress={handleReject}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? 'Enviando…' : 'Confirmar rechazo'}
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setRejecting(false);
                  setRejectReason('');
                }}
              >
                Cancelar
              </Button>
            </View>
          </Card>
        ) : (
          <View style={styles.actions}>
            <Button
              variant="primary"
              size="lg"
              icon="checkmark-circle-outline"
              onPress={handleAccept}
              disabled={acceptMutation.isPending}
            >
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
  const { colors, spacing, typography } = theme;
  return StyleSheet.create({
    loading: { ...typography.body, color: colors.muted, padding: spacing.lg },
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl + spacing.sm },
    headerCard: { marginBottom: spacing.md },
    stopCard: { marginBottom: spacing.sm },
    rejectCard: { marginTop: spacing.md },
    badge: { marginBottom: spacing.sm },
    title: { ...typography.subtitle, fontWeight: '700', color: colors.text },
    dateLabel: {
      ...typography.body,
      color: colors.muted,
      marginTop: spacing.xs,
      fontWeight: '500',
    },
    muted: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
    notes: {
      ...typography.caption,
      marginTop: spacing.sm,
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
      padding: spacing.sm,
      borderRadius: spacing.radiusMd,
    },
    sectionTitle: {
      ...typography.captionStrong,
      fontWeight: '700',
      color: colors.text,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    stopTitle: { ...typography.bodyStrong, color: colors.text },
    stopAddress: { ...typography.caption, color: colors.muted, marginTop: spacing.xxs },
    inputContainer: { marginTop: spacing.xs },
    input: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    actions: { gap: spacing.sm, marginTop: spacing.lg },
  });
}
