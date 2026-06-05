import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QrScanner } from '@components/QrScanner';
import { AssignScanError, assignShipmentByTracking } from '@core/api/shipments';
import { showToast } from '@core/feedback/toastStore';
import { resolveTrackingIdForAssign } from '@core/scanner/resolveTrackingIdForAssign';
import { useTheme, type AppTheme } from '@theme';

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

export function DeliveryScanPackageModal({ visible, onClose, onAssigned }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [error, setError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [failureShipmentId, setFailureShipmentId] = useState<string | null>(null);
  const postingRef = useRef(false);
  const inFlightKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setError(null);
      setBusy(false);
      setConfirm(null);
      setFailureShipmentId(null);
      postingRef.current = false;
      inFlightKeysRef.current.clear();
    }
  }, [visible]);

  const performAssign = useCallback(
    async (trackingKey: string, forceReassign: boolean) => {
      try {
        const result = await assignShipmentByTracking({
          trackingId: trackingKey,
          forceReassign,
        });
        if (result.reassigned) {
          showToast('Paquete reasignado');
        }
        onAssigned();
        onClose();
        return true;
      } catch (e) {
        if (e instanceof AssignScanError) {
          handleAssignScanError(e, trackingKey);
        } else if (axios.isAxiosError(e)) {
          const status = e.response?.status;
          const apiMsg = e.response?.data?.message;
          if (status === 401) {
            setError({ message: 'Sesión expirada. Volvé a iniciar sesión.', tone: 'critical' });
          } else if (status === 404) {
            setError({
              message: typeof apiMsg === 'string' ? apiMsg : 'No hay envío con ese código.',
              tone: 'warning',
            });
          } else {
            setError({
              message:
                typeof apiMsg === 'string' && apiMsg.trim() !== ''
                  ? apiMsg
                  : 'No se pudo asignar el envío.',
              tone: 'critical',
            });
          }
        } else {
          setError({ message: 'No se pudo asignar el envío.', tone: 'critical' });
        }
        return false;
      }

      function handleAssignScanError(err: AssignScanError, key: string) {
        switch (err.reason) {
          case 'requires_confirmation': {
            setConfirm({
              trackingKey: key,
              driverName: err.currentDriver?.name ?? null,
              currentStatus: err.currentStatus,
            });
            setError(null);
            return;
          }
          case 'not_collected_yet': {
            const status = err.currentStatus ?? '';
            setError({
              message:
                status !== ''
                  ? `El paquete aún no fue colectado (estado: ${humanStatus(status)}).`
                  : 'El paquete aún no fue colectado.',
              tone: 'warning',
            });
            return;
          }
          case 'flex_not_supported': {
            const failureTarget =
              err.shipmentId !== null
                ? { shipmentId: err.shipmentId, trackingId: err.trackingId }
                : undefined;
            setError({
              message:
                failureTarget !== undefined
                  ? 'Los paquetes Flex se gestionan desde Mercado Libre. Si no podés entregarlo, marcalo como fallido.'
                  : 'Los paquetes Flex se gestionan desde la app de Mercado Libre.',
              tone: 'warning',
              failureTarget,
            });
            return;
          }
          case 'already_delivered':
          case 'already_failed':
          case 'already_returned':
          case 'already_cancelled': {
            const label = humanStatus(err.currentStatus ?? err.reason.replace(/^already_/, ''));
            setError({
              message: `Este paquete ya está ${label}. Avisá a la oficina.`,
              tone: 'critical',
            });
            return;
          }
          case 'not_found': {
            setError({
              message: err.message !== '' ? err.message : 'No hay envío con ese código.',
              tone: 'warning',
            });
            return;
          }
          default: {
            setError({
              message: err.message !== '' ? err.message : 'No se pudo asignar el envío.',
              tone: 'critical',
            });
          }
        }
      }
    },
    [onAssigned, onClose],
  );

  const handleScan = useCallback(
    (raw: string) => {
      if (postingRef.current || confirm !== null) {
        return;
      }

      void (async () => {
        let trackingKey: string;
        try {
          trackingKey = normalizeAssignKey(await resolveTrackingIdForAssign(raw));
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : 'No se pudo leer el código. Probá de nuevo.';
          setError({ message: msg, tone: 'warning' });
          return;
        }

        if (inFlightKeysRef.current.has(trackingKey)) {
          return;
        }
        inFlightKeysRef.current.add(trackingKey);
        postingRef.current = true;
        setBusy(true);
        setError(null);

        try {
          await performAssign(trackingKey, false);
        } finally {
          inFlightKeysRef.current.delete(trackingKey);
          postingRef.current = false;
          setBusy(false);
        }
      })();
    },
    [confirm, performAssign],
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
    setFailureShipmentId(null);
    setError(null);
    showToast('Paquete reportado como fallido');
    onAssigned();
    onClose();
  }, [onAssigned, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Escanear paquete</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            hitSlop={12}
          >
            <Text style={styles.closeLabel}>Cerrar</Text>
          </Pressable>
        </View>

        <View style={styles.scannerWrap}>
          <QrScanner onScan={handleScan} scanCooldownMs={2000} containerStyle={styles.scanner} />
          {busy ? (
            <View style={styles.overlayBusy} pointerEvents="auto">
              <ActivityIndicator size="large" color="#ffffff" />
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
                  <Pressable
                    onPress={handleConfirmCancel}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.confirmBtn,
                      styles.confirmBtnSecondary,
                      pressed && styles.pressedSoft,
                      busy && styles.disabled,
                    ]}
                  >
                    <Text style={styles.confirmBtnSecondaryLabel}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void handleConfirmTakeover();
                    }}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.confirmBtn,
                      styles.confirmBtnPrimary,
                      pressed && styles.pressedStrong,
                      busy && styles.disabled,
                    ]}
                  >
                    <Text style={styles.confirmBtnPrimaryLabel}>Tomar paquete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {error != null ? (
          <View style={[styles.errorBanner, errorBannerStyleFor(theme, error.tone)]}>
            <Text style={[styles.errorText, errorTextStyleFor(theme, error.tone)]}>
              {error.message}
            </Text>
            {error.failureTarget != null ? (
              <Pressable
                onPress={handleOpenFailureModal}
                style={({ pressed }) => [styles.failureCta, pressed && styles.pressedStrong]}
              >
                <Text style={styles.failureCtaLabel}>Marcar como fallida</Text>
              </Pressable>
            ) : null}
          </View>
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

function normalizeAssignKey(trackingId: string): string {
  return trackingId.trim();
}

const STATUS_LABELS: Record<string, string> = {
  created: 'creado',
  picked: 'recogido del comercio',
  collected: 'colectado',
  in_depot: 'en depósito',
  in_cage: 'en jaula',
  pending_route: 'pendiente de ruta',
  assigned: 'asignado',
  out_for_delivery: 'en reparto',
  delivered: 'entregado',
  failed: 'con entrega fallida',
  returned: 'devuelto',
  cancelled: 'cancelado',
  missing_zone: 'sin zona',
};

function humanStatus(code: string): string {
  return STATUS_LABELS[code] ?? code;
}

function errorBannerStyleFor(t: AppTheme, tone: ErrorTone) {
  switch (tone) {
    case 'critical':
      return { backgroundColor: 'rgba(239, 68, 68, 0.12)' };
    case 'warning':
      return { backgroundColor: t.colors.surface };
    default:
      return { backgroundColor: t.colors.surface };
  }
}

function errorTextStyleFor(t: AppTheme, tone: ErrorTone) {
  switch (tone) {
    case 'critical':
      return { color: t.colors.danger };
    case 'warning':
      return { color: t.colors.text };
    default:
      return { color: t.colors.text };
  }
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      ...typography.subtitle,
      color: colors.text,
    },
    closeBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    closeBtnPressed: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
    closeLabel: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
    scannerWrap: {
      flex: 1,
      position: 'relative',
    },
    scanner: {
      flex: 1,
    },
    overlayBusy: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    overlayConfirm: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.65)',
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
      gap: spacing.md,
      marginTop: spacing.md,
    },
    confirmBtn: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.radiusMd,
    },
    confirmBtnPrimary: {
      backgroundColor: colors.primary,
    },
    confirmBtnPrimaryLabel: {
      ...typography.bodyStrong,
      color: colors.primaryOn,
    },
    confirmBtnSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    confirmBtnSecondaryLabel: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    pressedSoft: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
    pressedStrong: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
    disabled: {
      opacity: 0.5,
    },
    errorBanner: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    errorText: {
      ...typography.body,
      textAlign: 'center',
    },
    failureCta: {
      alignSelf: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.danger,
      minWidth: 220,
      alignItems: 'center',
    },
    failureCtaLabel: {
      ...typography.bodyStrong,
      color: colors.background,
    },
  });
}
