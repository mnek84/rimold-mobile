import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, ScreenContainer } from '@components/ui';
import type { ColectaStackParamList } from '@navigation/colectaStackTypes';
import { useTheme, type AppTheme } from '@theme';

import { ContextualActionButton } from '../components/ContextualActionButton';
import { IncidentReportSheet } from '../components/IncidentReportSheet';
import { formatShortDate, formatTimeRange } from '../lib/formatSchedule';
import {
  useArriveAtStop,
  useCompletePickupOrder,
  useCompleteStop,
  usePickupOrder,
  useReportPickupIncident,
  useSkipStop,
  useStartPickupOrder,
  useStartScanningStop,
} from '../hooks/usePickupOrders';
import { usePickupOrderRealtime } from '../hooks/usePickupOrderRealtime';
import type { IncidentPhase } from '../types';
import { labelForAction, nextAction } from '../lib/contextualAction';
import {
  PICKUP_ORDER_STATUS_LABEL,
  PICKUP_STOP_STATUS_LABEL,
} from '../lib/pickupOrderStatus';
import { usePickupOrderActiveStore } from '../store/pickupOrderActiveStore';

import { useColectaSessionStore } from '@modules/colecta/colectaSessionStore';

type Props = NativeStackScreenProps<ColectaStackParamList, 'PickupOrderInProgress'>;

async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getLastKnownPositionAsync();
    if (!pos) {
      const current = await Location.getCurrentPositionAsync({});
      return { lat: current.coords.latitude, lng: current.coords.longitude };
    }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

export function PickupOrderInProgressScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const query = usePickupOrder(orderId);
  usePickupOrderRealtime(orderId);
  const setActive = usePickupOrderActiveStore((s) => s.setActiveOrder);

  const startOrder = useStartPickupOrder();
  const arriveAt = useArriveAtStop();
  const startScanning = useStartScanningStop();
  const completeStop = useCompleteStop();
  const completeOrder = useCompletePickupOrder();
  const skipStopMut = useSkipStop();
  const reportIncidentMut = useReportPickupIncident();

  const [busy, setBusy] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);

  const order = query.data;

  useEffect(() => {
    if (
      order &&
      (order.status === 'in_progress' || order.status === 'returning_to_warehouse')
    ) {
      setActive(order.id);
    } else if (
      order &&
      (order.status === 'completed' ||
        order.status === 'cancelled' ||
        order.status === 'rejected')
    ) {
      setActive(null);
    }
  }, [order, setActive]);

  // Refetch al volver a esta pantalla (ej: al cerrar el scanner tras finalizar
  // la colecta de un stop). Sin esto la data cacheada mostraba "Continuar
  // escaneando" incluso cuando el backend ya marcó el stop como Completed.
  useFocusEffect(
    useCallback(() => {
      void query.refetch();
    }, [query]),
  );

  const action = useMemo(
    () => (order ? nextAction(order) : { kind: 'none' as const }),
    [order],
  );

  const activeStop = useMemo(
    () =>
      order?.stops.find(
        (s) => s.status === 'en_route' || s.status === 'arrived' || s.status === 'scanning',
      ) ?? null,
    [order?.stops],
  );

  const defaultIncidentPhase: IncidentPhase = useMemo(() => {
    if (!order) return 'other';
    if (order.status === 'returning_to_warehouse') return 'returning';
    if (activeStop?.status === 'arrived' || activeStop?.status === 'scanning') return 'at_client';
    if (activeStop?.status === 'en_route') return 'in_transit';
    return 'other';
  }, [order, activeStop?.status]);

  if (query.isLoading || !order) {
    return (
      <ScreenContainer>
        <Text style={{ color: theme.colors.muted, padding: 16 }}>Cargando…</Text>
      </ScreenContainer>
    );
  }

  async function handleAction() {
    if (!order) return;
    setBusy(true);
    try {
      switch (action.kind) {
        case 'start-order':
          await startOrder.mutateAsync(order.id);
          break;
        case 'arrive-stop': {
          const pos = await getCurrentPosition();
          await arriveAt.mutateAsync({
            orderId: order.id,
            stopId: action.stop.id,
            lat: pos?.lat,
            lng: pos?.lng,
          });
          break;
        }
        case 'start-scanning': {
          const stopFresh = await startScanning.mutateAsync({
            orderId: order.id,
            stopId: action.stop.id,
          });
          if (stopFresh.collection_id) {
            // Preparar el session store para el scan (backend ya emitió COLLECTION_STARTED).
            useColectaSessionStore.getState().initFromPickup({
              collectionId: stopFresh.collection_id,
              clientId: action.stop.warehouse?.business_id ?? '',
              clientName: order.business?.name ?? '',
              warehouseId: stopFresh.warehouse_id,
              warehouseName: action.stop.warehouse?.name ?? '',
              pickupContext: { orderId: order.id, stopId: stopFresh.id },
            });
            navigation.navigate('ColectaScan', {
              clientId: action.stop.warehouse?.business_id ?? '',
              clientName: order.business?.name ?? '',
              warehouseId: stopFresh.warehouse_id,
              warehouseName: action.stop.warehouse?.name ?? '',
            });
          }
          break;
        }
        case 'complete-stop':
          await completeStop.mutateAsync({ orderId: order.id, stopId: action.stop.id });
          break;
        case 'complete-order': {
          // El backend verifica que la posición GPS del chofer esté dentro del
          // radio del crossdocking. Si el GPS falla, mandamos coords null y el
          // cierre queda a criterio del admin (fallback), pero el flujo normal
          // requiere la ubicación real.
          const pos = await getCurrentPosition();
          await completeOrder.mutateAsync({
            orderId: order.id,
            lat: pos?.lat,
            lng: pos?.lng,
          });
          Alert.alert('¡Terminaste!', 'La colecta quedó completada.', [
            { text: 'OK', onPress: () => navigation.replace('PickupOrdersList') },
          ]);
          break;
        }
        case 'none':
          break;
      }
    } catch (e) {
      const apiMsg =
        axios.isAxiosError(e) && typeof e.response?.data?.message === 'string'
          ? e.response.data.message
          : e instanceof Error
            ? e.message
            : 'No se pudo completar la acción.';

      // Errores del cierre del cross traducidos a mensajes UX-friendly.
      if (apiMsg.startsWith('too_far_from_crossdocking:')) {
        Alert.alert(
          'Estás lejos del depósito',
          apiMsg.replace('too_far_from_crossdocking:', '').trim(),
        );
      } else if (apiMsg.startsWith('no_completed_stops:')) {
        Alert.alert(
          'No podés cerrar todavía',
          'La colecta no tiene ninguna parada terminada. Volvé a las paradas.',
        );
      } else {
        Alert.alert('Error', apiMsg);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSkipStop() {
    if (action.kind !== 'arrive-stop' && action.kind !== 'start-scanning') return;
    Alert.alert('Omitir parada', '¿Por qué omitís esta parada?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cliente cerrado',
        onPress: () => void confirmSkip('Cliente cerrado'),
      },
      {
        text: 'Otro motivo',
        onPress: () => void confirmSkip('Otro'),
      },
    ]);
  }

  async function confirmSkip(reason: string) {
    if (action.kind !== 'arrive-stop' && action.kind !== 'start-scanning') return;
    try {
      await skipStopMut.mutateAsync({
        orderId: order!.id,
        stopId: action.stop.id,
        reason,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo omitir la parada.';
      Alert.alert('Error', msg);
    }
  }

  const canSkip = action.kind === 'arrive-stop' || action.kind === 'start-scanning';
  // Cuando el stop está en Scanning la acción natural es reanudar el scan,
  // no cerrar la parada. Invertimos: primary = continuar, secondary = terminar.
  // Esto es crítico si la app crasheó / se reinició — al reabrir, el botón
  // grande sigue siendo "Continuar escaneando" y no cierra la colecta por error.
  const isResumingScan = action.kind === 'complete-stop';

  function openScanFromStop(stop: NonNullable<typeof activeStop>) {
    if (!stop.collection_id) {
      Alert.alert(
        'Escaneo no disponible',
        'La colecta de esta parada no arrancó. Apretá "Empezar escaneo" para iniciarla.',
      );
      return;
    }
    useColectaSessionStore.getState().initFromPickup({
      collectionId: stop.collection_id,
      clientId: stop.warehouse?.business_id ?? '',
      clientName: order!.business?.name ?? '',
      warehouseId: stop.warehouse_id,
      warehouseName: stop.warehouse?.name ?? '',
      pickupContext: { orderId: order!.id, stopId: stop.id },
    });
    navigation.navigate('ColectaScan', {
      clientId: stop.warehouse?.business_id ?? '',
      clientName: order!.business?.name ?? '',
      warehouseId: stop.warehouse_id,
      warehouseName: stop.warehouse?.name ?? '',
    });
  }

  function handleReopenScan() {
    if (action.kind !== 'complete-stop') return;
    openScanFromStop(action.stop);
  }

  async function handleCompleteStopFromResumeState() {
    if (action.kind !== 'complete-stop') return;
    setBusy(true);
    try {
      await completeStop.mutateAsync({ orderId: order!.id, stopId: action.stop.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo terminar la parada.';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }

  const primaryLabel = isResumingScan
    ? 'Continuar escaneando'
    : labelForAction(action, order);
  const primaryOnPress = isResumingScan ? handleReopenScan : handleAction;

  const secondaryLabel = isResumingScan
    ? 'Terminar parada'
    : canSkip
      ? 'Omitir esta parada'
      : undefined;
  const secondaryOnPress = isResumingScan
    ? handleCompleteStopFromResumeState
    : canSkip
      ? handleSkipStop
      : undefined;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={styles.badge}>{PICKUP_ORDER_STATUS_LABEL[order.status]}</Text>
          <Text style={styles.timeHero}>
            {formatTimeRange(order.scheduled_time_from, order.scheduled_time_to) || '—'}
          </Text>
          <Text style={styles.dateLabel}>{formatShortDate(order.scheduled_date)}</Text>
          <Text style={styles.muted}>
            Destino: {order.crossdocking_location?.name ?? '—'}
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Paradas</Text>
        {order.stops.map((stop) => {
          const active = stop.status === 'en_route' || stop.status === 'arrived' || stop.status === 'scanning';
          return (
            <Card
              key={stop.id}
              style={[
                styles.stopCard,
                active ? styles.stopCardActive : undefined,
              ]}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopTitle}>
                    {stop.sequence}. {stop.warehouse?.name ?? '—'}
                  </Text>
                  {stop.warehouse?.address ? (
                    <Text style={styles.stopAddress}>{stop.warehouse.address}</Text>
                  ) : null}
                  <Text style={styles.muted}>
                    {PICKUP_STOP_STATUS_LABEL[stop.status]}
                  </Text>
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <View style={styles.incidentBar}>
        <Text
          style={styles.incidentLink}
          onPress={() => setIncidentOpen(true)}
          accessibilityRole="button"
        >
          Informar novedad
        </Text>
      </View>

      <ContextualActionButton
        action={action}
        label={primaryLabel}
        loading={busy}
        onPress={primaryOnPress}
        secondaryLabel={secondaryLabel}
        onSecondaryPress={secondaryOnPress}
      />

      <IncidentReportSheet
        visible={incidentOpen}
        defaultPhase={defaultIncidentPhase}
        onClose={() => setIncidentOpen(false)}
        onSubmit={async ({ phase, kind, description }) => {
          try {
            await reportIncidentMut.mutateAsync({
              orderId: order.id,
              phase,
              kind,
              description,
              pickupStopId: activeStop?.id ?? null,
            });
            Alert.alert('Novedad enviada', 'El depósito ya la ve.');
            setIncidentOpen(false);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'No se pudo reportar la novedad.';
            Alert.alert('Error', msg);
          }
        }}
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
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: 8,
      marginBottom: 8,
    },
    stopCard: { marginBottom: 8 },
    stopCardActive: { borderColor: theme.colors.primary, borderWidth: 2 },
    stopTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
    stopAddress: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    incidentBar: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      alignItems: 'flex-end',
    },
    incidentLink: {
      fontSize: 13,
      color: theme.colors.danger ?? '#dc2626',
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
  });
}
