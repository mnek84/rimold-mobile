import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button } from '@components/ui';
import { finishDriverWorkday, parseDriverWorkday, type DriverWorkday } from '@core/api/workday';
import { messageForShipmentListError } from '@core/api/userFacingErrors';
import { flushAndCountUnsyncedShipmentWork, type UnsyncedShipmentWork } from '@core/sync';
import { useTheme, type AppTheme } from '@theme';

import { useDriverWorkday } from '../hooks/useDriverWorkday';
import { finishOutcomeMessage, flexOpenLabel, plural, workdayStatusTitle } from '../workdayView';
import { OpenFlexAppButton } from './OpenFlexAppButton';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Después de un cierre exitoso: refrescar mapa / listado. */
  onFinished?: () => void;
  insetBottom?: number;
};

/** Mientras la hoja está abierta y hay Flex sin confirmar, se relee cada 20 s. */
const POLL_MS = 20_000;

function pendingStopsFrom(err: unknown): { count: number; summary: DriverWorkday | null } | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 422) return null;
  const data = err.response.data as Record<string, unknown> | undefined;
  const errors = (data?.errors ?? {}) as Record<string, unknown>;
  const arr = errors.pending_stops;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const match = String(arr[0]).match(/(\d+)/);
  return {
    count: match !== null ? Number(match[1]) : 0,
    summary: data?.summary != null ? parseDriverWorkday(data.summary) : null,
  };
}

/**
 * "Finalizar jornada": una sola salida para los dos modelos de reparto.
 *
 * - Propios: se cierran con las reglas de la ruta interna (el servidor pide
 *   confirmación si quedan paradas sin entregar).
 * - Flex: no se cierran desde acá. Se muestran los que Mercado Libre todavía
 *   no informó, con el acceso a Mercado Libre Flex para confirmarlos.
 *
 * Antes de cerrar se vacía la cola offline: una entrega confirmada sin señal
 * que todavía no llegó al servidor quedaría registrada como "no entregada" por
 * el cierre de ruta.
 */
export function WorkdayFinishSheet({ visible, onClose, onFinished, insetBottom = 0 }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { workday, setWorkday, loading, error, reload } = useDriverWorkday({ enabled: visible, pollMs: POLL_MS });
  const [unsynced, setUnsynced] = useState<UnsyncedShipmentWork | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const refreshUnsynced = useCallback(async () => {
    try {
      setUnsynced(await flushAndCountUnsyncedShipmentWork());
    } catch {
      setUnsynced(null);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setActionError(null);
    setOutcome(null);
    void refreshUnsynced();
  }, [visible, refreshUnsynced]);

  const blockedByQueue = (unsynced?.pending ?? 0) > 0;

  const finish = useCallback(
    async (force: boolean) => {
      setBusy(true);
      setActionError(null);
      try {
        // Última oportunidad de enviar lo que quedó en la cola.
        const left = await flushAndCountUnsyncedShipmentWork();
        setUnsynced(left);
        if (left.pending > 0) {
          setActionError(
            `${plural(left.pending, 'cambio de entrega', 'cambios de entrega')} todavía no llegó al servidor. Conectate a internet y volvé a intentar: si finalizás ahora, esas entregas quedarían como no entregadas.`,
          );
          return;
        }
        const res = await finishDriverWorkday({ force });
        setWorkday(res.summary);
        setOutcome(finishOutcomeMessage(res));
        onFinished?.();
      } catch (e) {
        const pending = pendingStopsFrom(e);
        if (pending !== null) {
          if (pending.summary !== null) setWorkday(pending.summary);
          Alert.alert(
            'Finalizar jornada',
            pending.count === 1
              ? 'Queda 1 parada propia sin entregar. Al finalizar se registra como no entregada y el paquete vuelve al depósito. Tus envíos Flex no cambian.'
              : `Quedan ${pending.count} paradas propias sin entregar. Al finalizar se registran como no entregadas y esos paquetes vuelven al depósito. Tus envíos Flex no cambian.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Finalizar y devolver', style: 'destructive', onPress: () => void finish(true) },
            ],
          );
          return;
        }
        setActionError(messageForShipmentListError(e));
      } finally {
        setBusy(false);
      }
    },
    [onFinished, setWorkday],
  );

  const w = workday;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.panel, { paddingBottom: theme.spacing.lg + insetBottom }]} onPress={() => undefined}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Ionicons name="flag-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.headerTitle}>Finalizar jornada</Text>
              {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
            </View>

            {w === null && error !== null ? <Banner tone="danger" message={error} /> : null}
            {w === null && error === null ? <ActivityIndicator color={theme.colors.primary} /> : null}

            {w !== null ? (
              <>
                <Text style={styles.statusTitle}>{workdayStatusTitle(w)}</Text>
                <Text style={styles.muted}>
                  {plural(w.totals.total, 'envío', 'envíos')} hoy · {w.totals.delivered} entregados ·{' '}
                  {w.totals.pending} pendientes · {w.totals.incident + w.totals.cancelled} con incidencia
                </Text>

                {w.own.total > 0 || w.own.route !== null ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Propios · se confirman en esta app</Text>
                    <Text style={styles.body}>
                      {w.own.delivered} entregados · {w.own.pending} pendientes · {w.own.incident + w.own.cancelled} con
                      incidencia
                    </Text>
                    <Text style={styles.muted}>
                      {w.own.route === null
                        ? 'Sin ruta propia abierta.'
                        : w.own.route.isFinished
                          ? 'Ruta propia finalizada.'
                          : w.own.route.isStarted
                            ? `Ruta propia en curso · ${plural(w.own.route.stopsOpen, 'parada abierta', 'paradas abiertas')}`
                            : 'Ruta propia sin salir a reparto.'}
                    </Text>
                  </View>
                ) : null}

                {w.flex.total > 0 ? (
                  <View style={styles.block}>
                    <Text style={styles.blockTitle}>Mercado Libre Flex · se confirman en su app</Text>
                    <Text style={styles.body}>
                      {w.flex.delivered} informados como entregados · {w.flex.pending} pendientes ·{' '}
                      {w.flex.incident + w.flex.cancelled} con incidencia
                    </Text>
                    {w.flex.openShipments.slice(0, 6).map((s) => (
                      <Text key={s.shipmentId} style={styles.muted} numberOfLines={2}>
                        • {s.tracking ?? 'Sin tracking'}: {flexOpenLabel(s)}
                      </Text>
                    ))}
                    {w.flex.openShipments.length > 6 ? (
                      <Text style={styles.muted}>… y {w.flex.openShipments.length - 6} más.</Text>
                    ) : null}
                    {w.flex.awaitingMl > 0 ? (
                      <View style={styles.flexAction}>
                        <OpenFlexAppButton variant="outline" />
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {w.workday.notices.map((n) => (
                  <Banner key={n.code} tone="info" message={n.message} />
                ))}
              </>
            ) : null}

            {blockedByQueue ? (
              <Banner
                tone="danger"
                title="Hay cambios sin enviar"
                message={`${plural(unsynced?.pending ?? 0, 'cambio de entrega', 'cambios de entrega')} todavía no llegó al servidor. Conectate a internet: hasta que se envíen no se puede finalizar.`}
              />
            ) : null}
            {(unsynced?.failed ?? 0) > 0 ? (
              <Banner
                tone="danger"
                message={`${plural(unsynced?.failed ?? 0, 'cambio no se pudo registrar', 'cambios no se pudieron registrar')}. Avisale a tu supervisor.`}
              />
            ) : null}
            {outcome !== null ? <Banner tone={w?.workday.status === 'completed' ? 'success' : 'info'} message={outcome} /> : null}
            {actionError !== null ? <Banner tone="danger" message={actionError} /> : null}

            <View style={styles.actions}>
              <Button
                variant="primary"
                size="lg"
                icon="flag"
                loading={busy}
                disabled={busy || w === null || blockedByQueue}
                onPress={() => void finish(false)}
              >
                Finalizar jornada
              </Button>
              <Button variant="ghost" disabled={busy} onPress={() => void Promise.all([reload(), refreshUnsynced()])}>
                Actualizar estado
              </Button>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    panel: {
      maxHeight: '88%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: spacing.radiusCard,
      borderTopRightRadius: spacing.radiusCard,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: spacing.xs,
      borderRadius: spacing.xxs,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    content: { gap: spacing.md, paddingBottom: spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    headerTitle: { ...typography.subtitle, color: colors.text, flex: 1 },
    statusTitle: { ...typography.bodyStrong, color: colors.text },
    block: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: spacing.radiusLg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    blockTitle: { ...typography.captionStrong, color: colors.text },
    body: { ...typography.body, color: colors.text },
    muted: { ...typography.caption, color: colors.muted },
    flexAction: { marginTop: spacing.xs },
    actions: { gap: spacing.sm, marginTop: spacing.xs },
  });
}
