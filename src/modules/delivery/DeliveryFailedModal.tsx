import { pickAndCompressPhoto } from '@core/media/compressPhoto';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useTheme, type AppTheme } from '@theme';

import { useDeliveryFailureReasonsQuery } from '@modules/delivery/hooks/useDeliveryFailureReasonsQuery';

type Props = {
  visible: boolean;
  shipmentId: string;
  onClose: () => void;
  onQueued: () => void;
};

export function DeliveryFailedModal({ visible, shipmentId, onClose, onQueued }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const reasonsQuery = useDeliveryFailureReasonsQuery(visible);
  const options = reasonsQuery.data;

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setNote('');
    setPhotoDataUrl(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || options == null || options.length === 0) {
      return;
    }
    setSelectedCode((prev) => {
      if (prev != null && options.some((r) => r.code === prev)) {
        return prev;
      }
      return options[0]?.code ?? null;
    });
  }, [visible, options]);

  const takePhoto = useCallback(async () => {
    const dataUrl = await pickAndCompressPhoto(
      'Se necesita cámara o galería para adjuntar la foto obligatoria.',
    );
    if (dataUrl != null) {
      setPhotoDataUrl(dataUrl);
    }
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
    const list = options ?? [];
    const opt = list.find((r) => r.code === selectedCode);
    if (opt == null) {
      Alert.alert(
        'Motivo requerido',
        reasonsQuery.isError
          ? 'No se pudieron cargar los motivos. Revisá la conexión e intentá de nuevo.'
          : 'Elegí un motivo de la lista.',
      );
      return;
    }

    const payload: Record<string, string> = {
      shipmentId: sid,
      failed_reason: opt.label,
      failed_reason_code: opt.code,
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
  }, [
    note,
    onClose,
    onQueued,
    options,
    photoDataUrl,
    reasonsQuery.isError,
    selectedCode,
    shipmentId,
  ]);

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
            {reasonsQuery.isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.loadingHint}>Cargando motivos…</Text>
              </View>
            ) : reasonsQuery.isError ? (
              <Text style={styles.errorHint}>
                No se pudieron cargar los motivos. Cerrá y volvé a abrir, o revisá la conexión.
              </Text>
            ) : (options?.length ?? 0) === 0 ? (
              <Text style={styles.errorHint}>
                No hay motivos activos. Pedí a operaciones que carguen el catálogo.
              </Text>
            ) : (
              <View style={styles.reasonList}>
                {(options ?? []).map((opt) => {
                  const selected = selectedCode === opt.code;
                  return (
                    <Pressable
                      key={opt.code}
                      onPress={() => setSelectedCode(opt.code)}
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
            )}

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
      borderBottomColor: colors.border,
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
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
    },
    loadingHint: {
      ...typography.body,
      color: colors.muted,
    },
    errorHint: {
      ...typography.body,
      color: colors.danger,
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
      borderColor: colors.border,
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
      borderColor: colors.border,
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
      borderColor: colors.border,
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
