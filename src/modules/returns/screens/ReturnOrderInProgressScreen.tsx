import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, ScreenContainer } from '@components/ui';
import { PhotoCaptureModal, type PhotoCaptureResult } from '@core/media/PhotoCaptureModal';
import { formatShortWeekday } from '@modules/pickups/lib/formatSchedule';
import type { ReturnStackParamList } from '@navigation/returnStackTypes';
import { useTheme, type AppTheme } from '@theme';

import {
  useArriveAtReturnStop,
  useAttachReturnStopConforme,
  useCompleteReturnOrder,
  useCompleteReturnStop,
  useReturnOrder,
  useSkipReturnStop,
  useStartReturnOrder,
  useStartScanningReturnStop,
} from '../hooks/useReturnOrders';
import {
  RETURN_ORDER_STATUS_LABEL,
  RETURN_STOP_STATUS_LABEL,
  nextStopAction,
  type StopAction,
} from '../lib/returnOrderStatus';
import type { ReturnStop } from '../types';

type Props = NativeStackScreenProps<ReturnStackParamList, 'ReturnOrderInProgress'>;

export function ReturnOrderInProgressScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const query = useReturnOrder(orderId);
  const startOrder = useStartReturnOrder();
  const completeOrder = useCompleteReturnOrder();
  const arrive = useArriveAtReturnStop();
  const startScanning = useStartScanningReturnStop();
  const completeStop = useCompleteReturnStop();
  const skipStop = useSkipReturnStop();
  const attachConforme = useAttachReturnStopConforme();

  const [skippingStopId, setSkippingStopId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');

  // Parada para la que se está pidiendo el conforme; `null` = cámara cerrada.
  const [conformeStopId, setConformeStopId] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState('');

  const order = query.data;
  const busy =
    startOrder.isPending ||
    completeOrder.isPending ||
    arrive.isPending ||
    startScanning.isPending ||
    completeStop.isPending ||
    skipStop.isPending ||
    attachConforme.isPending;

  function fail(e: unknown, fallback: string) {
    Alert.alert('Error', e instanceof Error ? e.message : fallback);
  }

  async function handleStopAction(stop: ReturnStop, action: StopAction) {
    if (!order) return;

    // El conforme no es una transición: abre la cámara y la entrega se cierra
    // después, cuando la foto ya está arriba.
    if (action === 'conforme') {
      setConformeStopId(stop.id);
      return;
    }

    try {
      if (action === 'arrive') {
        await arrive.mutateAsync({ orderId: order.id, stopId: stop.id });
      } else if (action === 'scan') {
        await startScanning.mutateAsync({ orderId: order.id, stopId: stop.id });
      } else {
        await completeStop.mutateAsync({ orderId: order.id, stopId: stop.id });
      }
    } catch (e) {
      fail(e, 'No se pudo actualizar la parada.');
    }
  }

  async function handleConformeCaptured(result: PhotoCaptureResult) {
    const stopId = conformeStopId;
    setConformeStopId(null);
    if (!order || !stopId) return;

    try {
      await attachConforme.mutateAsync({
        orderId: order.id,
        stopId,
        dataUrl: result.dataUrl,
        receiverName: receiverName.trim() || null,
      });
      setReceiverName('');
      Alert.alert('Conforme adjuntado', 'Ya podés confirmar la entrega.');
    } catch (e) {
      fail(e, 'No se pudo adjuntar el conforme.');
    }
  }

  async function handleSkip(stop: ReturnStop) {
    if (!order) return;
    if (!skipReason.trim()) {
      Alert.alert('Motivo requerido', 'Escribí por qué omitís la parada.');
      return;
    }
    try {
      await skipStop.mutateAsync({
        orderId: order.id,
        stopId: stop.id,
        reason: skipReason.trim(),
      });
      setSkippingStopId(null);
      setSkipReason('');
    } catch (e) {
      fail(e, 'No se pudo omitir la parada.');
    }
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
          <Text style={styles.badge}>{RETURN_ORDER_STATUS_LABEL[order.status]}</Text>
          <Text style={styles.title}>{order.business?.name ?? 'Devolución'}</Text>
          <Text style={styles.muted}>{formatShortWeekday(order.scheduled_date)}</Text>
          <Text style={styles.muted}>Salís de: {order.crossdocking_location?.name ?? '—'}</Text>
        </Card>

        {order.status === 'accepted' ? (
          <Button
            variant="primary"
            disabled={busy}
            onPress={async () => {
              try {
                await startOrder.mutateAsync(order.id);
              } catch (e) {
                fail(e, 'No se pudo iniciar el recorrido.');
              }
            }}
          >
            {startOrder.isPending ? 'Iniciando…' : 'Iniciar recorrido'}
          </Button>
        ) : null}

        {order.status === 'returning_to_warehouse' ? (
          <Button
            variant="primary"
            disabled={busy}
            onPress={async () => {
              try {
                await completeOrder.mutateAsync(order.id);
                Alert.alert('Devolución cerrada', 'Listo, ya volviste al depósito.');
                navigation.goBack();
              } catch (e) {
                fail(e, 'No se pudo cerrar la devolución.');
              }
            }}
          >
            {completeOrder.isPending ? 'Cerrando…' : 'Cerrar devolución'}
          </Button>
        ) : null}

        <Text style={styles.sectionTitle}>Paradas ({order.stops.length})</Text>

        {order.stops.map((stop) => {
          const action = nextStopAction(stop);
          const isSkipping = skippingStopId === stop.id;

          return (
            <Card key={stop.id} style={{ marginBottom: 10 }}>
              <View style={styles.stopHeader}>
                <Text style={styles.stopTitle}>
                  {stop.sequence}. {stop.warehouse?.name ?? stop.warehouse_id}
                </Text>
                <Text style={styles.stopStatus}>{RETURN_STOP_STATUS_LABEL[stop.status]}</Text>
              </View>

              {stop.warehouse?.address ? (
                <Text style={styles.stopAddress}>{stop.warehouse.address}</Text>
              ) : null}

              <Text style={styles.stopAddress}>
                {stop.shipments.length} bulto{stop.shipments.length === 1 ? '' : 's'}
              </Text>

              {stop.status === 'scanning' && stop.shipments.length > 0 ? (
                <View style={styles.trackingList}>
                  {stop.shipments.map((s) => (
                    <Text key={s.id} style={styles.tracking}>
                      {s.tracking}
                    </Text>
                  ))}
                </View>
              ) : null}

              {stop.conforme_path ? (
                <Text style={styles.conformeOk}>
                  Conforme adjunto
                  {stop.conforme_receiver_name ? ` — recibió ${stop.conforme_receiver_name}` : ''}
                </Text>
              ) : stop.status === 'scanning' ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.stopAddress}>¿Quién recibe? (opcional)</Text>
                  <TextInput
                    style={styles.inputSingle}
                    value={receiverName}
                    onChangeText={setReceiverName}
                    placeholder="Nombre de quien firma"
                    placeholderTextColor={theme.colors.muted}
                  />
                  <Text style={styles.hint}>
                    Sacá la foto del remito firmado para poder cerrar la entrega.
                  </Text>
                </View>
              ) : null}

              {stop.skip_reason ? (
                <Text style={styles.skipReason}>Omitida: {stop.skip_reason}</Text>
              ) : null}

              {isSkipping ? (
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    style={styles.input}
                    multiline
                    value={skipReason}
                    onChangeText={setSkipReason}
                    placeholder="¿Por qué no pudiste entregar?"
                    placeholderTextColor={theme.colors.muted}
                  />
                  <View style={styles.actions}>
                    <Button
                      variant="ghost"
                      onPress={() => {
                        setSkippingStopId(null);
                        setSkipReason('');
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button variant="danger" disabled={busy} onPress={() => void handleSkip(stop)}>
                      {skipStop.isPending ? 'Enviando…' : 'Confirmar'}
                    </Button>
                  </View>
                </View>
              ) : action ? (
                <View style={styles.actions}>
                  <Button
                    variant="primary"
                    disabled={busy}
                    onPress={() => void handleStopAction(stop, action.action)}
                  >
                    {action.label}
                  </Button>
                  <Button variant="ghost" disabled={busy} onPress={() => setSkippingStopId(stop.id)}>
                    Omitir
                  </Button>
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>

      <PhotoCaptureModal
        visible={conformeStopId !== null}
        onCapture={(result) => void handleConformeCaptured(result)}
        onClose={() => setConformeStopId(null)}
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
    muted: { fontSize: 14, color: theme.colors.muted, marginTop: 4 },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    stopHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    stopTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.colors.text },
    stopStatus: { fontSize: 12, color: theme.colors.muted, fontWeight: '600' },
    stopAddress: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
    trackingList: {
      marginTop: 8,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 6,
      padding: 8,
      gap: 2,
    },
    tracking: { fontSize: 13, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    skipReason: { marginTop: 6, fontSize: 13, color: theme.colors.muted, fontStyle: 'italic' },
    conformeOk: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    hint: { marginTop: 6, fontSize: 12, color: theme.colors.muted },
    inputSingle: {
      marginTop: 6,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    input: {
      minHeight: 70,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: 8,
      padding: 10,
      textAlignVertical: 'top',
    },
    actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  });
}
