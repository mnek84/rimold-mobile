import { PhotoCaptureModal, type PhotoCaptureResult } from '@core/media/PhotoCaptureModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoPreview } from '@components/PhotoPreview';
import { Banner, Button, Input, SegmentedControl } from '@components/ui';
import { SignaturePad, type SignaturePadHandle } from '@components/SignaturePad';
import { TOAST_DELIVERY } from '@core/feedback/toastMessages';
import { showToast } from '@core/feedback/toastStore';
import { captureEventGeo } from '@core/location/captureEventGeo';
import { enqueueEvent, EventType } from '@core/sync';
import { useTheme, type AppTheme } from '@theme';

import { OpenFlexAppButton } from './components/OpenFlexAppButton';

const RELATIONSHIP_OPTIONS = [
  { value: 'titular', label: 'Titular' },
  { value: 'vecino', label: 'Vecino' },
  { value: 'portero', label: 'Portero' },
] as const;

type RelationshipValue = (typeof RELATIONSHIP_OPTIONS)[number]['value'];

type Props = {
  visible: boolean;
  shipmentId: string;
  /**
   * Mercado Libre Flex. Un envío Flex NO se confirma desde esta app: la
   * entrega se registra en Mercado Libre Flex y su estado llega por webhook.
   * Antes este modal tenía una variante Flex que encolaba `SHIPMENT_DELIVERED`;
   * el servidor la rechazaba (`rejected_external_authority`) y el envío seguía
   * "en camino" mientras el chofer creía haberlo entregado. Ahora, si llega a
   * abrirse para un Flex, sólo explica dónde se confirma y no encola nada.
   */
  isFlex?: boolean;
  onClose: () => void;
  /** Called after the event is persisted to the local queue (non-blocking for sync). */
  onQueued: () => void;
};

export function DeliveryDeliveredModal({
  visible,
  shipmentId,
  isFlex = false,
  onClose,
  onQueued,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [dni, setDni] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipValue>('titular');
  const [photo, setPhoto] = useState<PhotoCaptureResult | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  const submitIntentRef = useRef(false);
  // Doble tap en "Entregado" encolaba dos eventos. El backend los deduplica por
  // idempotency key, pero el chofer veía dos toasts y no sabía cuál valía.
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setDni('');
      setReceiverName('');
      setRelationship('titular');
      setPhoto(null);
      setCameraOpen(false);
      submitIntentRef.current = false;
      submittingRef.current = false;
      setSubmitting(false);
      sigRef.current?.clear();
    }
  }, [visible]);

  const openCamera = useCallback(() => setCameraOpen(true), []);
  const closeCamera = useCallback(() => setCameraOpen(false), []);
  const handleCameraCapture = useCallback((result: PhotoCaptureResult) => {
    setPhoto(result);
    setCameraOpen(false);
  }, []);

  const clearPhoto = useCallback(() => setPhoto(null), []);

  /**
   * Encola el evento de entrega.
   *
   * `signatureDataUrl` llega vacío en Flex, donde no hay firma que pedir. El
   * GPS se adjunta en los dos casos y nunca bloquea: `captureEventGeo` devuelve
   * `null` si el fix no llega a tiempo, y la entrega se registra igual.
   */
  const finalizeSubmit = useCallback(
    (signatureDataUrl: string) => {
      const sid = shipmentId.trim();
      if (sid === '') {
        return;
      }
      if (submittingRef.current || isFlex) {
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);

      void captureEventGeo()
        .then((geo) => {
          const signature = signatureDataUrl.trim();
          const payload = {
            shipmentId: sid,
            dni: dni.trim(),
            receiver_name: receiverName.trim(),
            relationship,
            ...(signature !== '' ? { signature } : {}),
            ...(photo != null ? { photo: photo.dataUrl } : {}),
            ...(geo != null ? { geo } : {}),
          };

          return enqueueEvent({
            type: EventType.SHIPMENT_DELIVERED,
            payload,
          });
        })
        .then(() => {
          showToast(TOAST_DELIVERY.marked);
          onQueued();
          onClose();
        })
        .catch(() => {
          showToast(TOAST_DELIVERY.sendError);
        })
        .finally(() => {
          submittingRef.current = false;
          setSubmitting(false);
        });
    },
    [dni, isFlex, onClose, onQueued, photo, receiverName, relationship, shipmentId],
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
    if (isFlex) {
      return;
    }
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
  }, [dni, isFlex, receiverName]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Confirmar entrega</Text>
            <Button variant="ghost" onPress={onClose}>
              Cerrar
            </Button>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {isFlex ? (
              <>
                <Banner
                  tone="neutral"
                  title="Envío Mercado Libre Flex"
                  message="Esta entrega se confirma en la app Mercado Libre Flex. Cuando Mercado Libre la informe, el estado se actualiza solo en esta app."
                />
                <View style={styles.flexAction}>
                  <OpenFlexAppButton />
                </View>
              </>
            ) : (
              <>
              <Text style={styles.sectionTitle}>Datos del receptor</Text>

              <Input
                label="DNI"
                containerStyle={styles.field}
                value={dni}
                onChangeText={setDni}
                placeholder="Número de documento"
                keyboardType="default"
              />

              <Input
                label="Nombre"
                containerStyle={styles.field}
                value={receiverName}
                onChangeText={setReceiverName}
                placeholder="Nombre completo"
              />

              <Text style={styles.label}>Vínculo</Text>
              <SegmentedControl
                accessibilityLabel="Vínculo"
                options={RELATIONSHIP_OPTIONS}
                value={relationship}
                onChange={setRelationship}
              />

              <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Firma</Text>
              <SignaturePad ref={sigRef} onSignature={onSignature} onEmpty={onSignatureEmpty} />
              <Button
                variant="ghost"
                icon="refresh-outline"
                style={styles.secondaryBtn}
                onPress={() => sigRef.current?.clear()}
              >
                Limpiar firma
              </Button>
              </>
            )}

            {isFlex ? null : (
            <>
            <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Foto</Text>
            <View style={styles.photoRow}>
              <Button variant="secondary" icon="camera-outline" onPress={openCamera}>
                {photo != null ? 'Cambiar foto' : 'Tomar foto'}
              </Button>
              {photo != null ? (
                <Button variant="ghost" icon="trash-outline" onPress={clearPhoto}>
                  Quitar
                </Button>
              ) : null}
            </View>
            {photo != null ? (
              <View style={styles.photoPreviewWrap}>
                <PhotoPreview uri={photo.previewUri} size={120} />
              </View>
            ) : null}

            <Button
              variant="success"
              size="lg"
              icon="checkmark-circle"
              disabled={submitting}
              style={styles.submitBtn}
              onPress={handleSubmit}
            >
              {submitting ? 'Registrando…' : 'Registrar entrega'}
            </Button>
            </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <PhotoCaptureModal
        visible={cameraOpen}
        onCapture={handleCameraCapture}
        onClose={closeCamera}
      />
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
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
      paddingLeft: spacing.lg,
      paddingRight: spacing.xs,
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerTitle: {
      ...typography.subtitle,
      color: colors.text,
      flex: 1,
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
    field: {
      marginTop: spacing.md,
    },
    label: {
      ...typography.captionStrong,
      color: colors.text,
      marginBottom: spacing.sm,
      marginTop: spacing.md,
    },
    secondaryBtn: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
    },
    photoRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    photoPreviewWrap: {
      marginTop: spacing.sm,
    },
    flexAction: {
      marginTop: spacing.lg,
    },
    submitBtn: {
      marginTop: spacing.xl + spacing.sm,
    },
  });
}
