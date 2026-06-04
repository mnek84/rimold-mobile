import { useCallback, useEffect, useRef, useState } from 'react';
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
import { getAuthErrorMessage, loginWithQr } from '@core/api/auth';
import type { AuthUser } from '@core/auth/types';
import { parseEmployeeLoginQr } from '@core/scanner/parseEmployeeLoginQr';
import { useTheme, type AppTheme } from '@theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onLoggedIn: (token: string, user: AuthUser) => void;
};

export function LoginQrScannerModal({ visible, onClose, onLoggedIn }: Props) {
  const theme = useTheme();
  const styles = useThemeStyles(theme);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const postingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setScanError(null);
      setBusy(false);
      postingRef.current = false;
    }
  }, [visible]);

  const handleScan = useCallback(
    (raw: string) => {
      if (postingRef.current) return;

      const payload = parseEmployeeLoginQr(raw);
      if (payload === null) {
        setScanError('Código QR no válido. Debe ser un inicio de sesión de empleado.');
        return;
      }

      postingRef.current = true;
      setBusy(true);
      setScanError(null);

      void (async () => {
        try {
          const { token, user } = await loginWithQr({
            employee_id: payload.employee_id,
            secret: payload.secret,
          });
          onLoggedIn(token, user);
          onClose();
        } catch (e) {
          setScanError(
            getAuthErrorMessage(e, 'No se pudo iniciar sesión. Comprueba el código o tu conexión.'),
          );
        } finally {
          postingRef.current = false;
          setBusy(false);
        }
      })();
    },
    [onClose, onLoggedIn],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Escanear QR</Text>
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

        {scanError !== null ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{scanError}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function useThemeStyles(theme: AppTheme) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#000000',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      backgroundColor: '#000000',
    },
    headerTitle: {
      ...theme.typography.subtitle,
      color: theme.colors.text,
    },
    closeBtn: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.spacing.radiusMd,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    closeBtnPressed: {
      opacity: theme.motion.pressOpacitySoft,
      transform: [{ scale: theme.motion.pressScale }],
    },
    closeLabel: {
      ...theme.typography.bodyStrong,
      color: theme.colors.text,
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
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    errorBanner: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      backgroundColor: '#1a1a1a',
    },
    errorText: {
      ...theme.typography.caption,
      color: theme.colors.danger,
      textAlign: 'center',
    },
  });
}
