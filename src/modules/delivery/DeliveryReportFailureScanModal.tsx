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
import { AssignScanError, lookupShipmentByScan } from '@core/api/shipments';
import { showToast } from '@core/feedback/toastStore';
import { useTheme, type AppTheme } from '@theme';

import { DeliveryFailedModal } from './DeliveryFailedModal';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Refresh hook for the parent list once a failure event has been queued. */
  onReported: () => void;
};

type ErrorTone = 'info' | 'warning' | 'critical';

type ErrorState = {
  message: string;
  tone: ErrorTone;
};

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

/**
 * Driver-side flow to report a package failure outside the assigned route.
 *
 * Used when a Mercado Libre Flex package (or any package not in this driver's
 * route) needs to be marked as failed. Reuses the `DeliveryFailedModal` for
 * the photo + reason capture; this screen only handles the scan -> shipment
 * lookup step.
 */
export function DeliveryReportFailureScanModal({ visible, onClose, onReported }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [error, setError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failureShipmentId, setFailureShipmentId] = useState<string | null>(null);
  const postingRef = useRef(false);
  const inFlightKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setError(null);
      setBusy(false);
      setFailureShipmentId(null);
      postingRef.current = false;
      inFlightKeysRef.current.clear();
    }
  }, [visible]);

  const performLookup = useCallback(async (raw: string) => {
    try {
      const meta = await lookupShipmentByScan(raw);
      setError(null);
      setFailureShipmentId(meta.id);
    } catch (e) {
      if (e instanceof AssignScanError) {
        switch (e.reason) {
          case 'not_found': {
            setError({
              message: e.message !== '' ? e.message : 'No hay envío con ese código.',
              tone: 'warning',
            });
            return;
          }
          case 'already_delivered':
          case 'already_failed':
          case 'already_returned':
          case 'already_cancelled': {
            const status = e.currentStatus ?? e.reason.replace(/^already_/, '');
            setError({
              message: `Este paquete ya está ${humanStatus(status)}. Avisá a la oficina.`,
              tone: 'critical',
            });
            return;
          }
          default: {
            setError({
              message: e.message !== '' ? e.message : 'No se pudo buscar el envío.',
              tone: 'critical',
            });
            return;
          }
        }
      }
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        const apiMsg = e.response?.data?.message;
        if (status === 401) {
          setError({ message: 'Sesión expirada. Volvé a iniciar sesión.', tone: 'critical' });
          return;
        }
        setError({
          message:
            typeof apiMsg === 'string' && apiMsg.trim() !== ''
              ? apiMsg
              : 'No se pudo buscar el envío.',
          tone: 'critical',
        });
        return;
      }
      setError({ message: 'No se pudo buscar el envío.', tone: 'critical' });
    }
  }, []);

  const handleScan = useCallback(
    (raw: string) => {
      if (postingRef.current || failureShipmentId !== null) {
        return;
      }
      const trimmed = raw.trim();
      if (trimmed === '') {
        return;
      }
      if (inFlightKeysRef.current.has(trimmed)) {
        return;
      }
      inFlightKeysRef.current.add(trimmed);
      postingRef.current = true;
      setBusy(true);
      setError(null);

      void (async () => {
        try {
          await performLookup(trimmed);
        } finally {
          inFlightKeysRef.current.delete(trimmed);
          postingRef.current = false;
          setBusy(false);
        }
      })();
    },
    [failureShipmentId, performLookup],
  );

  const handleFailureClose = useCallback(() => {
    setFailureShipmentId(null);
  }, []);

  const handleFailureQueued = useCallback(() => {
    setFailureShipmentId(null);
    showToast('Paquete reportado como fallido');
    onReported();
    onClose();
  }, [onClose, onReported]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reportar paquete fallido</Text>
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
        </View>

        <View style={styles.hintBanner}>
          <Text style={styles.hintText}>
            Escaneá el código del paquete (Mercado Libre Flex u otro envío fuera de la ruta) para
            registrar el fallo con foto y motivo.
          </Text>
        </View>

        {error != null ? (
          <View style={[styles.errorBanner, errorBannerStyleFor(theme, error.tone)]}>
            <Text style={[styles.errorText, errorTextStyleFor(theme, error.tone)]}>
              {error.message}
            </Text>
          </View>
        ) : null}

        {failureShipmentId !== null ? (
          <DeliveryFailedModal
            visible={failureShipmentId !== null}
            shipmentId={failureShipmentId}
            onClose={handleFailureClose}
            onQueued={handleFailureQueued}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
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
    hintBanner: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    hintText: {
      ...typography.body,
      color: colors.muted,
      textAlign: 'center',
    },
    errorBanner: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    errorText: {
      ...typography.body,
      textAlign: 'center',
    },
  });
}
