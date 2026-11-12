import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Input, ScreenContainer, StatusBadge } from '@components/ui';
import type { ColectaStackParamList } from '@navigation/colectaStackTypes';
import { useTheme, type AppTheme } from '@theme';

import { ReminderSchedulerSheet } from '../components/ReminderSchedulerSheet';
import {
  useAcceptPickupOrder,
  usePickupOrder,
  useRejectPickupOrder,
} from '../hooks/usePickupOrders';
import { usePickupOrderRealtime } from '../hooks/usePickupOrderRealtime';
import { usePickupReminder } from '../hooks/usePickupReminder';
import { formatShortDate, formatTimeRange } from '../lib/formatSchedule';
import { PICKUP_ORDER_STATUS_LABEL } from '../lib/pickupOrderStatus';
import { PICKUP_ORDER_STATUS_PRESENTATION } from '../lib/pickupStatusTone';

type Props = NativeStackScreenProps<ColectaStackParamList, 'PickupOrderPending'>;

export function PickupOrderPendingScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const query = usePickupOrder(orderId);
  usePickupOrderRealtime(orderId);
  const acceptMutation = useAcceptPickupOrder();
  const rejectMutation = useRejectPickupOrder();
  const reminder = usePickupReminder();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const order = query.data;

  // Si el chofer entra a esta screen con una orden que YA fue aceptada
  // (refresh de la app, deep link, aceptación en otro device), el flujo natural
  // ya no es aceptar/rechazar: es arrancar el viaje. Lo mandamos a la screen
  // en progreso, donde el ContextualActionButton ofrece "Iniciar recorrido".
  // Excepción: si acabamos de aceptar y el ReminderSchedulerSheet está abierto,
  // el status ya es 'accepted' por el refetch — no redirijas hasta que el chofer
  // termine con el sheet, o le cerramos el recordatorio en la cara.
  useEffect(() => {
    if (!order) return;
    if (sheetVisible) return;
    if (
      order.status === 'in_progress' ||
      order.status === 'returning_to_warehouse' ||
      order.status === 'accepted'
    ) {
      navigation.replace('PickupOrderInProgress', { orderId: order.id });
    }
  }, [order, navigation, sheetVisible]);

  async function handleAccept() {
    if (!order) return;
    try {
      await acceptMutation.mutateAsync(order.id);
      setSheetVisible(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo aceptar la colecta.';
      Alert.alert('Error', msg);
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
      Alert.alert('Colecta rechazada', 'Ya avisamos al depósito.');
      navigation.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo rechazar la colecta.';
      Alert.alert('Error', msg);
    }
  }

  async function scheduleReminder(minutes: number) {
    if (!order) return;
    const firstStop = order.stops[0];
    const res = await reminder.schedule({
      orderId: order.id,
      scheduledDate: order.scheduled_date,
      scheduledTimeFrom: order.scheduled_time_from,
      minutesBefore: minutes,
      warehouseName: firstStop?.warehouse?.name ?? null,
    });
    setSheetVisible(false);
    if (!res.ok) {
      const msg =
        res.reason === 'denied'
          ? 'No dimos permiso para notificaciones.'
          : res.reason === 'past'
            ? 'El horario ya pasó, no se puede programar.'
            : res.reason === 'no_time'
              ? 'La colecta no tiene horario definido.'
              : 'No se pudo programar el recordatorio.';
      Alert.alert('Recordatorio', msg);
    }
    navigation.replace('PickupOrderInProgress', { orderId: order.id });
  }

  function skipReminder() {
    setSheetVisible(false);
    if (order) navigation.replace('PickupOrderInProgress', { orderId: order.id });
  }

  if (query.isLoading || !order) {
    return (
      <ScreenContainer>
        <Text style={styles.loading}>Cargando…</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.headerCard}>
          <StatusBadge
            label={PICKUP_ORDER_STATUS_LABEL[order.status]}
            tone={PICKUP_ORDER_STATUS_PRESENTATION[order.status].tone}
            icon={PICKUP_ORDER_STATUS_PRESENTATION[order.status].icon}
            style={styles.badge}
          />
          <Text style={styles.timeHero}>
            {formatTimeRange(order.scheduled_time_from, order.scheduled_time_to) || '—'}
          </Text>
          <Text style={styles.dateLabel}>{formatShortDate(order.scheduled_date)}</Text>
          <Text style={styles.muted}>
            Destino: {order.crossdocking_location?.name ?? '—'}
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

      <ReminderSchedulerSheet
        visible={sheetVisible}
        scheduledTimeFrom={order.scheduled_time_from}
        onSelect={scheduleReminder}
        onSkip={skipReminder}
        onClose={() => setSheetVisible(false)}
      />
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
    timeHero: {
      ...typography.display,
      color: colors.text,
      letterSpacing: -0.5,
      fontVariant: ['tabular-nums'],
    },
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
    actions: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
  });
}
