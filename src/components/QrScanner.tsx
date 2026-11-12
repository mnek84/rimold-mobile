import type { BarcodeScanningResult } from 'expo-camera';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Button } from '@components/ui';
import { useTheme, type AppTheme } from '@theme';

export type QrScannerProps = {
  /** Called once per successful scan after cooldown (receives raw QR string). */
  onScan: (raw: string) => void;
  /** Minimum milliseconds before another scan is accepted. Default 1500. */
  scanCooldownMs?: number;
  containerStyle?: ViewStyle;
};

/**
 * Full-screen QR scanner: requests camera permission, restricts to QR codes only,
 * and applies a cooldown so the same frame does not fire many callbacks.
 */
export function QrScanner({ onScan, scanCooldownMs = 1500, containerStyle }: QrScannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createScannerStyles(theme), [theme]);
  const [permission, requestPermission] = useCameraPermissions();
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const lockUntilRef = useRef(0);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (result.type !== 'qr') return;

      const now = Date.now();
      if (now < lockUntilRef.current) return;

      lockUntilRef.current = now + scanCooldownMs;
      onScanRef.current(result.data);
    },
    [scanCooldownMs],
  );

  if (permission === null) {
    return (
      <View style={[styles.centered, containerStyle]}>
        <Text style={styles.message}>Comprobando permisos…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, containerStyle]}>
        <Text style={styles.message}>Se necesita acceso a la cámara para escanear códigos QR.</Text>
        <Button size="lg" icon="camera-outline" onPress={() => void requestPermission()}>
          Permitir cámara
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, containerStyle]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>Enfoca el código QR</Text>
      </View>
    </View>
  );
}

function createScannerStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.media,
      overflow: 'hidden',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
      backgroundColor: colors.background,
    },
    message: {
      color: colors.text,
      ...typography.body,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    hint: {
      position: 'absolute',
      bottom: spacing.xxl + spacing.lg,
      left: spacing.xl,
      right: spacing.xl,
      alignItems: 'center',
    },
    hintText: {
      ...typography.body,
      color: colors.mediaOn,
      backgroundColor: colors.mediaScrim,
      borderRadius: spacing.radiusPill,
      overflow: 'hidden',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
    },
  });
}
