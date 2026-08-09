import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, ScreenContainer } from '@components/ui';
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
        <Text style={{ color: theme.colors.muted, padding: 16 }}>Cargando…</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.badge}>{PICKUP_ORDER_STATUS_LABEL[order.status]}</Text>
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
          <Card key={stop.id} style={{ marginBottom: 8 }}>
            <Text style={styles.stopTitle}>
              {stop.sequence}. {stop.warehouse?.name ?? stop.warehouse_id}
            </Text>
            {stop.warehouse?.address ? (
              <Text style={styles.stopAddress}>{stop.warehouse.address}</Text>
            ) : null}
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
              <Button
                variant="danger"
                onPress={handleReject}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? 'Enviando…' : 'Confirmar rechazo'}
              </Button>
            </View>
          </Card>
        ) : (
          <View style={styles.actions}>
            <Button
              variant="primary"
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
    timeHero: {
      fontSize: 40,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: -0.5,
      lineHeight: 44,
    },
    dateLabel: {
      fontSize: 15,
      color: theme.colors.muted,
      marginTop: 4,
      fontWeight: '500',
    },
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
      padding: 10,
      borderRadius: 8,
      marginTop: 6,
      fontSize: 14,
      textAlignVertical: 'top',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 12,
    },
  });
}
