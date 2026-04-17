import { pickAndCompressPhoto } from '@core/media/compressPhoto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { SignaturePad, type SignaturePadHandle } from '@components/SignaturePad';
import { TOAST_DELIVERY } from '@core/feedback/toastMessages';
import { showToast } from '@core/feedback/toastStore';
import { enqueueEvent, EventType } from '@core/sync';
import { borderSubtle, useTheme, type AppTheme } from '@theme';

const RELATIONSHIP_OPTIONS = [
  { value: 'titular', label: 'Titular' },
  { value: 'vecino', label: 'Vecino' },
  { value: 'portero', label: 'Portero' },
] as const;

type RelationshipValue = (typeof RELATIONSHIP_OPTIONS)[number]['value'];

type Props = {
  visible: boolean;
  shipmentId: string;
  onClose: () => void;
  /** Called after the event is persisted to the local queue (non-blocking for sync). */
  onQueued: () => void;
};

export function DeliveryDeliveredModal({ visible, shipmentId, onClose, onQueued }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [dni, setDni] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipValue>('titular');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);
  const submitIntentRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setDni('');
      setReceiverName('');
      setRelationship('titular');
      setPhotoDataUrl(null);
      submitIntentRef.current = false;
      sigRef.current?.clear();
    }
  }, [visible]);

  const takePhoto = useCallback(async () => {
    const dataUrl = await pickAndCompressPhoto(
      'Se necesita cámara o galería para adjuntar una foto.',
    );
    if (dataUrl != null) {
      setPhotoDataUrl(dataUrl);
    }
  }, []);

  const clearPhoto = useCallback(() => setPhotoDataUrl(null), []);

  const finalizeSubmit = useCallback(
    (signatureDataUrl: string) => {
      const sid = shipmentId.trim();
      if (sid === '') {
        return;
      }
      const payload = {
        shipmentId: sid,
        dni: dni.trim(),
        receiver_name: receiverName.trim(),
        relationship,
        signature: signatureDataUrl.trim(),
        ...(photoDataUrl != null ? { photo: photoDataUrl } : {}),
      };

      void enqueueEvent({
        type: EventType.SHIPMENT_DELIVERED,
        payload,
      })
        .then(() => {
          showToast(TOAST_DELIVERY.marked);
          onQueued();
          onClose();
        })
        .catch(() => {
          showToast(TOAST_DELIVERY.sendError);
        });
    },
    [dni, onClose, onQueued, photoDataUrl, receiverName, relationship, shipmentId],
  );

  const onSignature = useCallback(
    (dataUrl: string) => {
      if (!submitIntentRef.current) {
        return;
      }
      submitIntentRef.current = false;
      finalizeSubmit(dataUrl);
    },
    [finalizeSubmit],
  );

  const onSignatureEmpty = useCallback(() => {
    if (!submitIntentRef.current) {
      return;
    }
    submitIntentRef.current = false;
    Alert.alert('Firma', 'Dibujá la firma antes de confirmar.');
  }, []);

  const handleSubmit = useCallback(() => {
    if (dni.trim() === '') {
      Alert.alert('Datos', 'Ingresá el DNI.');
      return;
    }
    if (receiverName.trim() === '') {
      Alert.alert('Datos', 'Ingresá el nombre del receptor.');
      return;
    }
    submitIntentRef.current = true;
    sigRef.current?.readSignature();
  }, [dni, receiverName]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Confirmar entrega</Text>
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
            <Text style={styles.sectionTitle}>Datos del receptor</Text>

            <Text style={styles.label}>DNI</Text>
            <TextInput
              style={styles.input}
              value={dni}
              onChangeText={setDni}
              placeholder="Número de documento"
              placeholderTextColor={theme.colors.muted}
              keyboardType="default"
            />

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={receiverName}
              onChangeText={setReceiverName}
              placeholder="Nombre completo"
              placeholderTextColor={theme.colors.muted}
            />

            <Text style={styles.label}>Vínculo</Text>
            <View style={styles.relationshipRow}>
              {RELATIONSHIP_OPTIONS.map((opt) => {
                const selected = relationship === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setRelationship(opt.value)}
                    style={({ pressed }) => [
                      styles.relChip,
                      selected && styles.relChipSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.relChipLabel, selected && styles.relChipLabelSelected]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Firma</Text>
            <SignaturePad ref={sigRef} onSignature={onSignature} onEmpty={onSignatureEmpty} />
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              onPress={() => sigRef.current?.clear()}
            >
              <Text style={styles.secondaryBtnLabel}>Limpiar firma</Text>
            </Pressable>

            <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Foto</Text>
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
              <Text style={styles.photoHint}>Foto adjunta</Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && styles.pressed]}
              onPress={handleSubmit}
            >
              <Text style={styles.submitBtnLabel}>Registrar entrega</Text>
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
    label: {
      ...typography.captionStrong,
      color: colors.muted,
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    input: {
      borderWidth: 1,
      borderColor: borderSubtle,
      borderRadius: spacing.radiusMd,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.md,
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    relationshipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    relChip: {
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: borderSubtle,
      backgroundColor: colors.surface,
    },
    relChipSelected: {
      borderColor: colors.success,
      borderWidth: 2,
    },
    relChipLabel: {
      ...typography.bodyStrong,
      color: colors.muted,
    },
    relChipLabelSelected: {
      color: colors.success,
    },
    secondaryBtn: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    secondaryBtnLabel: {
      ...typography.bodyStrong,
      color: colors.primary,
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
    photoHint: {
      ...typography.captionStrong,
      color: colors.success,
      marginTop: spacing.sm,
    },
    submitBtn: {
      marginTop: spacing.xl + spacing.sm,
      paddingVertical: spacing.md + 4,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.success,
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
