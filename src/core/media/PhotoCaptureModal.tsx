import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, type AppTheme } from '@theme';

type Captured = { uri: string; base64: string };

export type PhotoCaptureResult = {
  /** `data:image/jpeg;base64,...` URL, safe to embed in the event payload. */
  dataUrl: string;
  /** Local `file://` URI of the captured JPEG — safe to feed to <Image>. */
  previewUri: string;
};

type Props = {
  visible: boolean;
  /**
   * Called when the user confirms the shot. Returns both the data URL (for
   * upload) and the local file URI (for on-screen preview). Data URLs of
   * this size render unreliably in <Image> on Android release builds, so
   * always use `previewUri` for display and `dataUrl` only for the payload.
   */
  onCapture: (result: PhotoCaptureResult) => void;
  /** Called on cancel or after a fatal capture error. */
  onClose: () => void;
};

/**
 * Full-screen in-app camera modal. Uses expo-camera's `CameraView` +
 * `takePictureAsync({ base64: true })` so we get the JPEG bytes without
 * touching `expo-image-manipulator` — which fails on Android release APKs
 * (ProGuard / Hermes) even when it works fine in Expo Go.
 *
 * `pictureSize` is capped at 1280x720 so the base64 payload stays well
 * below the backend's ~195KB per-string limit without any post-processing.
 */
export function PhotoCaptureModal({ visible, onCapture, onClose }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [captured, setCaptured] = useState<Captured | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCaptured(null);
      setBusy(false);
    }
  }, [visible]);

  const handleCapture = useCallback(async () => {
    if (busy || cameraRef.current == null) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        base64: true,
      });
      if (photo?.uri == null || photo.base64 == null || photo.base64 === '') {
        Alert.alert('Foto', 'No se pudo capturar la foto. Probá de nuevo.');
        return;
      }
      setCaptured({ uri: photo.uri, base64: photo.base64 });
    } catch (err) {
      console.warn('[PhotoCaptureModal.takePicture]', err);
      Alert.alert('Foto', 'La cámara no respondió. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handleRetake = useCallback(() => {
    if (busy) return;
    setCaptured(null);
  }, [busy]);

  const handleConfirm = useCallback(() => {
    if (busy || captured == null) return;
    onCapture({
      dataUrl: `data:image/jpeg;base64,${captured.base64}`,
      previewUri: captured.uri,
    });
  }, [busy, captured, onCapture]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Foto de la entrega</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            hitSlop={12}
          >
            <Text style={styles.headerBtnLabel}>Cancelar</Text>
          </Pressable>
        </View>

        {permission == null ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.message}>Comprobando permisos…</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centered}>
            <Text style={styles.message}>
              Se necesita acceso a la cámara para sacar la foto de entrega.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              onPress={() => void requestPermission()}
            >
              <Text style={styles.primaryBtnLabel}>Permitir cámara</Text>
            </Pressable>
          </View>
        ) : captured != null ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: captured.uri }} style={styles.preview} resizeMode="contain" />
            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
                onPress={handleRetake}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnLabel}>Reintentar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
                onPress={handleConfirm}
                disabled={busy}
              >
                <Text style={styles.primaryBtnLabel}>Usar foto</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              autofocus="on"
              pictureSize="1280x720"
            />
            <View style={styles.shutterRow} pointerEvents="box-none">
              <Pressable
                onPress={() => void handleCapture()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.shutter,
                  pressed && styles.pressed,
                  busy && styles.disabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Capturar foto"
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.background} />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#000000',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      ...typography.subtitle,
      color: colors.text,
      flex: 1,
    },
    headerBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    headerBtnLabel: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
      backgroundColor: colors.background,
      gap: spacing.md,
    },
    message: {
      color: colors.text,
      ...typography.body,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    cameraWrap: {
      flex: 1,
      backgroundColor: '#000000',
      overflow: 'hidden',
    },
    shutterRow: {
      position: 'absolute',
      bottom: spacing.xl + spacing.md,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    shutter: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: 'rgba(255,255,255,0.25)',
      borderWidth: 4,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutterInner: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#FFFFFF',
    },
    previewWrap: {
      flex: 1,
      backgroundColor: '#000000',
    },
    preview: {
      flex: 1,
      width: '100%',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.lg,
      backgroundColor: colors.background,
    },
    primaryBtn: {
      flex: 1,
      paddingVertical: spacing.md + 2,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnLabel: {
      ...typography.bodyStrong,
      color: colors.background,
    },
    secondaryBtn: {
      flex: 1,
      paddingVertical: spacing.md + 2,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnLabel: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    pressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
    disabled: {
      opacity: 0.5,
    },
  });
}
