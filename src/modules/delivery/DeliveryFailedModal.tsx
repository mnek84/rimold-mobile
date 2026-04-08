import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TOAST_DELIVERY } from '@core/feedback/toastMessages';
import { showToast } from '@core/feedback/toastStore';
import { enqueueEvent, EventType } from '@core/sync';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

const FAILURE_REASON_OPTIONS = [
  { value: 'No había nadie', label: 'No había nadie' },
  { value: 'Dirección incorrecta', label: 'Dirección incorrecta' },
  { value: 'Zona peligrosa', label: 'Zona peligrosa' },
  { value: 'Otro', label: 'Otro' },
] as const;

type FailureReasonValue = (typeof FAILURE_REASON_OPTIONS)[number]['value'];

type Props = {
  visible: boolean;
  shipmentId: string;
  onClose: () => void;
  onQueued: () => void;
};

export function DeliveryFailedModal({ visible, shipmentId, onClose, onQueued }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [reason, setReason] = useState<FailureReasonValue>('No había nadie');
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason('No había nadie');
      setNote('');
      setPhotoDataUrl(null);
    }
  }, [visible]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        Alert.alert('Permisos', 'Se necesita cámara o galería para adjuntar la foto obligatoria.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.75,
        base64: true,
      });
      if (result.canceled || !result.assets[0]?.base64) return;
      const mime = result.assets[0].mimeType?.includes('png') ? 'png' : 'jpeg';
      setPhotoDataUrl(`data:image/${mime};base64,${result.assets[0].base64}`);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.75,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const mime = result.assets[0].mimeType?.includes('png') ? 'png' : 'jpeg';
    setPhotoDataUrl(`data:image/${mime};base64,${result.assets[0].base64}`);
  }, []);

  const clearPhoto = useCallback(() => setPhotoDataUrl(null), []);

  const handleSubmit = useCallback(() => {
    const sid = shipmentId.trim();
    if (sid === '') {
      return;
    }
    if (photoDataUrl == null || photoDataUrl.trim() === '') {
      Alert.alert('Foto obligatoria', 'Adjuntá una foto del intento de entrega.');
      return;
    }

    const payload: Record<string, string> = {
      shipmentId: sid,
      failed_reason: reason,
      photo: photoDataUrl,
    };
    const noteTrim = note.trim();
    if (noteTrim !== '') {
      payload.failure_reason = noteTrim;
    }

    void enqueueEvent({
      type: EventType.SHIPMENT_FAILED,
      payload,
    })
      .then(() => {
        onQueued();
        onClose();
      })
      .catch(() => {
        showToast(TOAST_DELIVERY.sendError);
      });
  }, [note, onClose, onQueued, photoDataUrl, reason, shipmentId]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Entrega fallida</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
              hitSlop={12}
            >
              <Text style={styles.headerBtnLabel}>Cerrar</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionTitle}>Motivo</Text>
            <View style={styles.reasonList}>
              {FAILURE_REASON_OPTIONS.map((opt) => {
                const selected = reason === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setReason(opt.value)}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      selected && styles.reasonRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Nota (opcional)</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Detalles adicionales…"
              placeholderTextColor={theme.colors.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={[styles.sectionTitle, styles.sectionSpaced]}>
              Foto <Text style={styles.requiredMark}>*</Text>
            </Text>
            <Text style={styles.hint}>Requerida como respaldo del intento de entrega.</Text>
            <View style={styles.photoRow}>
              <Pressable
                style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
                onPress={() => void takePhoto()}
              >
                <Text style={styles.photoBtnLabel}>
                  {photoDataUrl != null ? 'Cambiar foto' : 'Tomar foto'}
                </Text>
              </Pressable>
              {photoDataUrl != null ? (
                <Pressable
                  style={({ pressed }) => [styles.photoBtnOutline, pressed && styles.pressed]}
                  onPress={clearPhoto}
                >
                  <Text style={styles.photoBtnOutlineLabel}>Quitar</Text>
                </Pressable>
              ) : null}
            </View>
            {photoDataUrl != null ? (
              <Text style={styles.photoOk}>Foto lista</Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && styles.pressed]}
              onPress={handleSubmit}
            >
              <Text style={styles.submitBtnLabel}>Registrar fallo</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl + spacing.lg,
    },
    sectionTitle: {
      ...typography.captionStrong,
      color: colors.muted,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionSpaced: {
      marginTop: spacing.xl,
    },
    requiredMark: {
      color: colors.danger,
    },
    hint: {
      ...typography.body,
      color: colors.muted,
      marginBottom: spacing.sm,
    },
    reasonList: {
      gap: spacing.sm,
    },
    reasonRow: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: borderSubtle,
      backgroundColor: colors.surface,
    },
    reasonRowSelected: {
      borderColor: colors.danger,
      borderWidth: 2,
    },
    reasonLabel: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    reasonLabelSelected: {
      fontWeight: '700',
    },
    noteInput: {
      minHeight: 100,
      borderWidth: 1,
      borderColor: borderSubtle,
      borderRadius: spacing.radiusMd,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.md,
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    photoRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    photoBtn: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: borderSubtle,
    },
    photoBtnLabel: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    photoBtnOutline: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    photoBtnOutlineLabel: {
      ...typography.bodyStrong,
      color: colors.muted,
    },
    photoOk: {
      ...typography.captionStrong,
      color: colors.success,
      marginTop: spacing.sm,
    },
    submitBtn: {
      marginTop: spacing.xl + spacing.sm,
      paddingVertical: spacing.md + 4,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.danger,
      alignItems: 'center',
    },
    submitBtnLabel: {
      ...typography.bodyStrong,
      color: colors.background,
    },
    pressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
  });
}
