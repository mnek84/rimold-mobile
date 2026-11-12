import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Input, ScreenContainer, StatusBadge } from '@components/ui';
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
import {
  RETURN_ORDER_STATUS_PRESENTATION,
  RETURN_STOP_STATUS_PRESENTATION,
} from '../lib/returnStatusTone';
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
        <Text style={styles.loading}>Cargando…</Text>
      </ScreenContainer>
    );
  }

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
          <Text style={styles.muted}>{formatShortWeekday(order.scheduled_date)}</Text>
          <Text style={styles.muted}>Salís de: {order.crossdocking_location?.name ?? '—'}</Text>
        </Card>

        {order.status === 'accepted' ? (
          <Button
            variant="primary"
            size="lg"
            icon="navigate-outline"
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
            size="lg"
            icon="checkmark-circle-outline"
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
            <Card key={stop.id} style={styles.stopCard}>
              <View style={styles.stopHeader}>
                <Text style={styles.stopTitle}>
                  {stop.sequence}. {stop.warehouse?.name ?? stop.warehouse_id}
                </Text>
                <StatusBadge
                  size="sm"
                  label={RETURN_STOP_STATUS_LABEL[stop.status]}
                  tone={RETURN_STOP_STATUS_PRESENTATION[stop.status].tone}
                  icon={RETURN_STOP_STATUS_PRESENTATION[stop.status].icon}
                />
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
                <View style={styles.conformeRow}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                  <Text style={styles.conformeOk}>
                    Conforme adjunto
                    {stop.conforme_receiver_name ? ` — recibió ${stop.conforme_receiver_name}` : ''}
                  </Text>
                </View>
              ) : stop.status === 'scanning' ? (
                <View style={styles.block}>
                  <Text style={styles.stopAddress}>¿Quién recibe? (opcional)</Text>
                  <Input
                    containerStyle={styles.inputContainer}
                    value={receiverName}
                    onChangeText={setReceiverName}
                    placeholder="Nombre de quien firma"
                    accessibilityLabel="¿Quién recibe? (opcional)"
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
                <View style={styles.block}>
                  <Input
                    style={styles.input}
                    multiline
                    value={skipReason}
                    onChangeText={setSkipReason}
                    placeholder="¿Por qué no pudiste entregar?"
                    accessibilityLabel="Motivo de la omisión"
                  />
                  <View style={styles.actions}>
                    <Button
                      variant="danger"
                      disabled={busy}
                      onPress={() => void handleSkip(stop)}
                      fullWidth
                    >
                      {skipStop.isPending ? 'Enviando…' : 'Confirmar'}
                    </Button>
                    <Button
                      variant="ghost"
                      onPress={() => {
                        setSkippingStopId(null);
                        setSkipReason('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </View>
                </View>
              ) : action ? (
                <View style={styles.actions}>
                  <Button
                    variant="primary"
                    size="lg"
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
  const { colors, spacing, typography } = theme;
  return StyleSheet.create({
    loading: { ...typography.body, color: colors.muted, padding: spacing.lg },
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl + spacing.sm },
    headerCard: { marginBottom: spacing.md },
    stopCard: { marginBottom: spacing.md },
    block: { marginTop: spacing.md },
    badge: { marginBottom: spacing.sm },
    title: { ...typography.subtitle, fontWeight: '700', color: colors.text },
    muted: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
    sectionTitle: {
      ...typography.captionStrong,
      fontWeight: '700',
      color: colors.text,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    stopHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    stopTitle: { ...typography.bodyStrong, flex: 1, color: colors.text },
    stopAddress: { ...typography.caption, color: colors.muted, marginTop: spacing.xxs },
    trackingList: {
      marginTop: spacing.sm,
      backgroundColor: colors.surfaceMuted,
      borderRadius: spacing.radiusMd,
      padding: spacing.sm,
      gap: spacing.xxs,
    },
    tracking: { ...typography.caption, color: colors.text, fontVariant: ['tabular-nums'] },
    skipReason: {
      ...typography.caption,
      marginTop: spacing.sm,
      color: colors.muted,
      fontStyle: 'italic',
    },
    conformeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    conformeOk: {
      ...typography.captionStrong,
      flex: 1,
      color: colors.text,
    },
    hint: { ...typography.caption, marginTop: spacing.sm, color: colors.muted },
    inputContainer: { marginTop: spacing.xs },
    input: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    actions: { gap: spacing.sm, marginTop: spacing.md },
  });
}
