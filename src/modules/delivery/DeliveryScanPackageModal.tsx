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
import { assignShipmentByTracking } from '@core/api/shipments';
import { resolveTrackingIdForAssign } from '@core/scanner/resolveTrackingIdForAssign';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful assign (including already assigned to this driver). */
  onAssigned: () => void;
};

export function DeliveryScanPackageModal({ visible, onClose, onAssigned }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const postingRef = useRef(false);
  const inFlightKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setScanError(null);
      setBusy(false);
      postingRef.current = false;
      inFlightKeysRef.current.clear();
    }
  }, [visible]);

  const handleScan = useCallback(
    (raw: string) => {
      if (postingRef.current) {
        return;
      }

      void (async () => {
        let trackingKey: string;
        try {
          trackingKey = normalizeAssignKey(await resolveTrackingIdForAssign(raw));
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : 'No se pudo leer el código. Probá de nuevo.';
          setScanError(msg);
          return;
        }

        if (inFlightKeysRef.current.has(trackingKey)) {
          return;
        }
        inFlightKeysRef.current.add(trackingKey);
        postingRef.current = true;
        setBusy(true);
        setScanError(null);

        try {
          await assignShipmentByTracking(trackingKey);
          onAssigned();
          onClose();
        } catch (e) {
          if (axios.isAxiosError(e)) {
            const status = e.response?.status;
            const apiMsg = e.response?.data?.message;
            if (status === 404) {
              setScanError(
                typeof apiMsg === 'string' ? apiMsg : 'No hay envío con ese código.',
              );
            } else if (status === 409) {
              setScanError(
                typeof apiMsg === 'string'
                  ? apiMsg
                  : 'Este envío ya está asignado a otro conductor.',
              );
            } else if (status === 401) {
              setScanError('Sesión expirada. Volvé a iniciar sesión.');
            } else {
              setScanError(
                typeof apiMsg === 'string' && apiMsg.trim() !== ''
                  ? apiMsg
                  : 'No se pudo asignar el envío.',
              );
            }
          } else {
            setScanError('No se pudo asignar el envío.');
          }
        } finally {
          inFlightKeysRef.current.delete(trackingKey);
          postingRef.current = false;
          setBusy(false);
        }
      })();
    },
    [onAssigned, onClose],
  );

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
        </View>

        {scanError != null ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{scanError}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function normalizeAssignKey(trackingId: string): string {
  return trackingId.trim();
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
      borderBottomColor: borderSubtle,
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
    errorBanner: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: borderSubtle,
    },
    errorText: {
      color: colors.danger,
      ...typography.body,
      textAlign: 'center',
    },
  });
}
