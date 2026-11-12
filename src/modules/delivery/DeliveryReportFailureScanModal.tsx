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
import { AssignScanError, lookupShipmentByScan } from '@core/api/shipments';
import { showToast } from '@core/feedback/toastStore';
import { useTheme, type AppTheme, type Tone } from '@theme';

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
          <Button variant="ghost" onPress={onClose}>
            Cerrar
          </Button>
        </View>

        <View style={styles.scannerWrap}>
          <QrScanner onScan={handleScan} scanCooldownMs={2000} containerStyle={styles.scanner} />
          {busy ? (
            <View style={styles.overlayBusy} pointerEvents="auto">
              <ActivityIndicator size="large" color={theme.colors.mediaOn} />
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
          <View style={styles.errorBanner}>
            <Banner tone={bannerToneFor(error.tone)} message={error.message} />
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
      paddingRight: spacing.xs,
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
      backgroundColor: colors.background,
    },
  });
}
