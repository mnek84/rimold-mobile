import type { BarcodeScanningResult } from 'expo-camera';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { borderSubtle, useTheme, type AppTheme } from '@theme';

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
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => void requestPermission()}
        >
          <Text style={styles.buttonLabel}>Permitir cámara</Text>
        </Pressable>
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
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000000',
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
    button: {
      backgroundColor: colors.surface,
      paddingVertical: spacing.md + 2,
      paddingHorizontal: spacing.xl,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: borderSubtle,
    },
    buttonPressed: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
    buttonLabel: {
      color: colors.text,
      ...typography.bodyStrong,
    },
    hint: {
      position: 'absolute',
      bottom: 48,
      left: spacing.xl,
      right: spacing.xl,
      alignItems: 'center',
    },
    hintText: {
      color: `${colors.text}cc`,
      ...typography.body,
    },
  });
}
