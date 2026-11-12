import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QrScanner } from '@components/QrScanner';
import { Banner, Button } from '@components/ui';
import { AssignScanError, assignShipmentByTracking } from '@core/api/shipments';
import { playScanFeedback } from '@core/feedback/scanFeedback';
import { showToast } from '@core/feedback/toastStore';
import {
  type AssignScanPackageInfo,
  resolveTrackingIdForAssign,
  takeLastAssignPackageInfo,
} from '@core/scanner/resolveTrackingIdForAssign';
import { useTheme, type AppTheme, type Tone } from '@theme';

import { DeliveryFailedModal } from './DeliveryFailedModal';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful assign (including already assigned to this driver). */
  onAssigned: () => void;
};

type ConfirmState = {
  trackingKey: string;
  driverName: string | null;
  currentStatus: string | null;
};

type ErrorTone = 'info' | 'warning' | 'critical';

type ErrorState = {
  message: string;
  tone: ErrorTone;
  /**
   * When the rejection identifies a shipment the driver could still report as
   * failed (e.g. flex packages not in their route), we surface a "Marcar como
   * fallida" action alongside the error banner.
   */
  failureTarget?: {
    shipmentId: string;
    trackingId: string | null;
  };
};

type ScannedItemStatus =
  | 'assigned'
  | 'reassigned'
  | 'already_scanned'
  | 'reported_failed'
  | 'error';

type ScannedItem = {
  /** Cantidad de bultos del envío, cuando son varios. */
  packageTotal?: number;
  id: string;
  trackingKey: string;
  status: ScannedItemStatus;
  errorMessage?: string;
  scannedAt: number;
};

const HISTORY_VISIBLE_COUNT = 4;

export function DeliveryScanPackageModal({ visible, onClose, onAssigned }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [error, setError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [failureShipmentId, setFailureShipmentId] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const postingRef = useRef(false);
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const successKeysRef = useRef<Set<string>>(new Set());
  const didAnyMutationRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setError(null);
      setBusy(false);
      setConfirm(null);
      setFailureShipmentId(null);
      setItems([]);
      postingRef.current = false;
      inFlightKeysRef.current.clear();
      successKeysRef.current.clear();
      didAnyMutationRef.current = false;
    }
  }, [visible]);

  const pushItem = useCallback(
    (partial: Omit<ScannedItem, 'id' | 'scannedAt'>) => {
      const scannedAt = Date.now();
      setItems((prev) => [
        { ...partial, id: `${partial.trackingKey}-${scannedAt}`, scannedAt },
        ...prev,
      ]);
    },
    [],
  );

  const successCount = useMemo(
    () =>
      items.filter((it) => it.status === 'assigned' || it.status === 'reassigned').length,
    [items],
  );
  const errorCount = useMemo(
    () => items.filter((it) => it.status === 'error').length,
    [items],
  );

  const performAssign = useCallback(
    async (trackingKey: string, forceReassign: boolean, packageTotal: number | null = null) => {
      try {
        const result = await assignShipmentByTracking({
          trackingId: trackingKey,
          forceReassign,
        });
        if (result.reassigned) {
          showToast('Paquete reasignado');
        }
        successKeysRef.current.add(trackingKey);
        didAnyMutationRef.current = true;
        pushItem({
          trackingKey,
          status: result.reassigned ? 'reassigned' : 'assigned',
          ...(packageTotal != null && packageTotal > 1 ? { packageTotal } : {}),
        });
        playScanFeedback('success');
        setError(null);
        return true;
      } catch (e) {
        let errorMessage = 'No se pudo asignar el envío.';
        let addErrorItem = true;
        if (e instanceof AssignScanError) {
          const outcome = handleAssignScanError(e, trackingKey);
          errorMessage = outcome.message;
          addErrorItem = outcome.addErrorItem;
        } else if (axios.isAxiosError(e)) {
          const status = e.response?.status;
          const apiMsg = e.response?.data?.message;
          if (status === 401) {
            errorMessage = 'Sesión expirada. Volvé a iniciar sesión.';
            setError({ message: errorMessage, tone: 'critical' });
          } else if (status === 404) {
            errorMessage =
              typeof apiMsg === 'string' ? apiMsg : 'No hay envío con ese código.';
            setError({ message: errorMessage, tone: 'warning' });
          } else {
            errorMessage =
              typeof apiMsg === 'string' && apiMsg.trim() !== ''
                ? apiMsg
                : 'No se pudo asignar el envío.';
            setError({ message: errorMessage, tone: 'critical' });
          }
        } else {
          setError({ message: errorMessage, tone: 'critical' });
        }
        if (addErrorItem) {
          pushItem({
            trackingKey,
            status: 'error',
            errorMessage,
            ...(packageTotal != null && packageTotal > 1 ? { packageTotal } : {}),
          });
          playScanFeedback('error');
        }
        return false;
      }

      function handleAssignScanError(
        err: AssignScanError,
        key: string,
      ): { message: string; addErrorItem: boolean } {
        switch (err.reason) {
          case 'requires_confirmation': {
            setConfirm({
              trackingKey: key,
              driverName: err.currentDriver?.name ?? null,
              currentStatus: err.currentStatus,
            });
            setError(null);
            return { message: '', addErrorItem: false };
          }
          case 'not_collected_yet': {
            const status = err.currentStatus ?? '';
            const message =
              status !== ''
                ? `El paquete aún no fue colectado (estado: ${humanStatus(status)}).`
                : 'El paquete aún no fue colectado.';
            setError({ message, tone: 'warning' });
            return { message, addErrorItem: true };
          }
          case 'flex_not_supported': {
            // Antes se ofrecía "marcalo como fallido" desde acá. Desde 2026-11
            // el estado de un Flex lo informa Mercado Libre y el servidor NO
            // aplica un fallido enviado desde esta app: ofrecerlo sería
            // invitar a una acción que no cuenta.
            const message =
              'Los paquetes Flex se entregan y se marcan como fallidos en la app de Mercado Libre Flex. Igual los vas a ver en tus paradas.';
            setError({ message, tone: 'warning' });
            return { message, addErrorItem: true };
          }
          case 'already_delivered':
          case 'already_failed':
          case 'already_returned':
          case 'already_cancelled': {
            const label = humanStatus(err.currentStatus ?? err.reason.replace(/^already_/, ''));
            const message = `Este paquete ya está ${label}. Avisá a la oficina.`;
            setError({ message, tone: 'critical' });
            return { message, addErrorItem: true };
          }
          case 'not_found': {
            const message = err.message !== '' ? err.message : 'No hay envío con ese código.';
            setError({ message, tone: 'warning' });
            return { message, addErrorItem: true };
          }
          default: {
            const message =
              err.message !== '' ? err.message : 'No se pudo asignar el envío.';
            setError({ message, tone: 'critical' });
            return { message, addErrorItem: true };
          }
        }
      }
    },
    [pushItem],
  );

  const handleScan = useCallback(
    (raw: string) => {
      if (postingRef.current || confirm !== null) {
        return;
      }

      void (async () => {
        let trackingKey: string;
        let packageInfo: AssignScanPackageInfo | null = null;
        try {
          trackingKey = normalizeAssignKey(await resolveTrackingIdForAssign(raw));
          packageInfo = takeLastAssignPackageInfo();
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : 'No se pudo leer el código. Probá de nuevo.';
          setError({ message: msg, tone: 'warning' });
          playScanFeedback('error');
          return;
        }

        if (inFlightKeysRef.current.has(trackingKey)) {
          return;
        }
        if (successKeysRef.current.has(trackingKey)) {
          pushItem({
            trackingKey,
            status: 'already_scanned',
            ...(packageInfo != null ? { packageTotal: packageInfo.total } : {}),
          });
          showToast('Ya escaneado en esta sesión');
          playScanFeedback('success');
          return;
        }
        inFlightKeysRef.current.add(trackingKey);
        postingRef.current = true;
        setBusy(true);
        setError(null);

        try {
          await performAssign(trackingKey, false, packageInfo?.total ?? null);
        } finally {
          inFlightKeysRef.current.delete(trackingKey);
          postingRef.current = false;
          setBusy(false);
        }
      })();
    },
    [confirm, performAssign, pushItem],
  );

  const handleConfirmTakeover = useCallback(async () => {
    if (confirm === null || postingRef.current) {
      return;
    }
    const { trackingKey } = confirm;
    postingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await performAssign(trackingKey, true);
      setConfirm(null);
    } finally {
      postingRef.current = false;
      setBusy(false);
    }
  }, [confirm, performAssign]);

  const handleConfirmCancel = useCallback(() => {
    setConfirm(null);
    setError(null);
  }, []);

  const handleOpenFailureModal = useCallback(() => {
    if (error?.failureTarget == null) {
      return;
    }
    setFailureShipmentId(error.failureTarget.shipmentId);
  }, [error]);

  const handleFailureModalClose = useCallback(() => {
    setFailureShipmentId(null);
  }, []);

  const handleFailureQueued = useCallback(() => {
    const target = error?.failureTarget;
    setFailureShipmentId(null);
    setError(null);
    showToast('Paquete reportado como fallido');
    didAnyMutationRef.current = true;
    if (target?.trackingId != null && target.trackingId !== '') {
      pushItem({ trackingKey: target.trackingId, status: 'reported_failed' });
    }
  }, [error, pushItem]);

  const handleFinalize = useCallback(() => {
    if (didAnyMutationRef.current) {
      onAssigned();
    }
    onClose();
  }, [onAssigned, onClose]);

  const hasScans = items.length > 0;
  const finalizeLabel = hasScans ? `Finalizar (${successCount})` : 'Cerrar';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleFinalize}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Escanear paquete</Text>
          <Button
            variant={hasScans ? 'primary' : 'ghost'}
            icon={hasScans ? 'checkmark-done' : undefined}
            onPress={handleFinalize}
          >
            {finalizeLabel}
          </Button>
        </View>

        <View style={styles.scannerWrap}>
          <QrScanner onScan={handleScan} scanCooldownMs={2000} containerStyle={styles.scanner} />
          {busy ? (
            <View style={styles.overlayBusy} pointerEvents="auto">
              <ActivityIndicator size="large" color={theme.colors.mediaOn} />
            </View>
          ) : null}
          {confirm !== null ? (
            <View style={styles.overlayConfirm} pointerEvents="auto">
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>Paquete ya asignado</Text>
                <Text style={styles.confirmBody}>
                  {confirm.driverName != null && confirm.driverName !== ''
                    ? `Este paquete está asignado a ${confirm.driverName}.`
                    : 'Este paquete ya tiene un conductor asignado.'}
                </Text>
                <Text style={styles.confirmQuestion}>¿Tomar este paquete?</Text>
                <View style={styles.confirmActions}>
                  <Button variant="secondary" onPress={handleConfirmCancel} disabled={busy}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    onPress={() => {
                      void handleConfirmTakeover();
                    }}
                    disabled={busy}
                  >
                    Tomar paquete
                  </Button>
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {error != null ? (
          <View style={styles.errorBanner}>
            <Banner tone={bannerToneFor(error.tone)} message={error.message} />
            {error.failureTarget != null ? (
              <Button
                variant="danger"
                icon="close-circle"
                onPress={handleOpenFailureModal}
                style={styles.failureCta}
              >
                Marcar como fallida
              </Button>
            ) : null}
          </View>
        ) : null}

        {hasScans ? (
          <ScannedItemsList
            items={items.slice(0, HISTORY_VISIBLE_COUNT)}
            totalCount={items.length}
            successCount={successCount}
            errorCount={errorCount}
            theme={theme}
            styles={styles}
          />
        ) : null}

        {failureShipmentId !== null ? (
          <DeliveryFailedModal
            visible={failureShipmentId !== null}
            shipmentId={failureShipmentId}
            onClose={handleFailureModalClose}
            onQueued={handleFailureQueued}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

type ScannedItemsListProps = {
  items: ScannedItem[];
  totalCount: number;
  successCount: number;
  errorCount: number;
  theme: AppTheme;
  styles: ReturnType<typeof createStyles>;
};

function ScannedItemsList({
  items,
  totalCount,
  successCount,
  errorCount,
  theme,
  styles,
}: ScannedItemsListProps) {
  const overflow = totalCount - items.length;
  return (
    <View style={styles.historyBlock}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Últimos escaneos</Text>
        <Text style={styles.historyMeta}>
          {successCount} OK{errorCount > 0 ? ` · ${errorCount} ✕` : ''}
        </Text>
      </View>
      {items.map((it) => (
        <View key={it.id} style={styles.historyRow}>
          <Ionicons
            name={dotIconFor(it.status)}
            size={16}
            color={dotColorFor(theme, it.status)}
            style={styles.historyDot}
          />
          <Text style={styles.historyKey} numberOfLines={1}>
            {it.trackingKey}
            {it.packageTotal != null && it.packageTotal > 1 ? ` · ${it.packageTotal} bultos` : ''}
          </Text>
          <Text style={styles.historyStatus} numberOfLines={1}>
            {statusLabelFor(it)}
          </Text>
        </View>
      ))}
      {overflow > 0 ? (
        <Text style={styles.historyOverflow}>+{overflow} más</Text>
      ) : null}
    </View>
  );
}

function dotIconFor(status: ScannedItemStatus): keyof typeof Ionicons.glyphMap {
  switch (status) {
    case 'assigned':
    case 'reassigned':
      return 'checkmark-circle';
    case 'already_scanned':
      return 'ellipse-outline';
    case 'reported_failed':
    case 'error':
      return 'close-circle';
  }
}

function dotColorFor(t: AppTheme, status: ScannedItemStatus): string {
  switch (status) {
    case 'assigned':
    case 'reassigned':
      return t.colors.success;
    case 'already_scanned':
      return t.colors.muted;
    case 'reported_failed':
    case 'error':
      return t.colors.danger;
  }
}

function statusLabelFor(item: ScannedItem): string {
  switch (item.status) {
    case 'assigned':
      return 'Asignado';
    case 'reassigned':
      return 'Reasignado';
    case 'already_scanned':
      return 'Ya escaneado';
    case 'reported_failed':
      return 'Reportado fallido';
    case 'error':
      return item.errorMessage ?? 'Error';
  }
}

function normalizeAssignKey(trackingId: string): string {
  return trackingId.trim();
}

const STATUS_LABELS: Record<string, string> = {
  created: 'creado',
  picked: 'recogido del comercio',
  collected: 'colectado',
  in_warehouse: 'en depósito',
  in_cage: 'en jaula',
  pending_route: 'pendiente de ruta',
  assigned: 'asignado',
  out_for_delivery: 'en reparto',
  near_destination: 'cerca del destino',
  delivered: 'entregado',
  failed: 'con entrega fallida',
  returned: 'devuelto',
  cancelled: 'cancelado',
  missing_zone: 'sin zona',
};

function humanStatus(code: string): string {
  return STATUS_LABELS[code] ?? code;
}

function bannerToneFor(tone: ErrorTone): Tone {
  switch (tone) {
    case 'critical':
      return 'danger';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
      paddingVertical: spacing.xs,
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerTitle: {
      ...typography.subtitle,
      color: colors.text,
      flex: 1,
    },
    scannerWrap: {
      flex: 1,
      position: 'relative',
      backgroundColor: colors.media,
    },
    scanner: {
      flex: 1,
    },
    overlayBusy: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.mediaScrim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overlayConfirm: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.mediaScrim,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    confirmCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      gap: spacing.sm,
    },
    confirmTitle: {
      ...typography.subtitle,
      color: colors.text,
    },
    confirmBody: {
      ...typography.body,
      color: colors.text,
    },
    confirmQuestion: {
      ...typography.bodyStrong,
      color: colors.text,
      marginTop: spacing.xs,
    },
    confirmActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    errorBanner: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      gap: spacing.sm,
    },
    failureCta: {
      alignSelf: 'center',
      minWidth: 220,
    },
    historyBlock: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.xs,
    },
    historyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    historyTitle: {
      ...typography.captionStrong,
      color: colors.text,
      textTransform: 'uppercase',
    },
    historyMeta: {
      ...typography.captionStrong,
      color: colors.muted,
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    historyDot: {
      width: 16,
    },
    historyKey: {
      ...typography.caption,
      color: colors.text,
      flexShrink: 0,
      maxWidth: '38%',
    },
    historyStatus: {
      ...typography.caption,
      color: colors.muted,
      flex: 1,
    },
    historyOverflow: {
      ...typography.caption,
      color: colors.muted,
      alignSelf: 'flex-end',
      marginTop: spacing.xs,
    },
  });
}
