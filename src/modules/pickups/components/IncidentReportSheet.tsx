import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Banner, Button, Input } from '@components/ui';
import { useTheme, type AppTheme } from '@theme';

import type { IncidentKind, IncidentPhase } from '../types';

const PHASE_OPTIONS: { value: IncidentPhase; label: string }[] = [
  { value: 'in_transit', label: 'En viaje al cliente' },
  { value: 'at_client', label: 'En el cliente' },
  { value: 'returning', label: 'Volviendo al depósito' },
  { value: 'other', label: 'Otra' },
];

const KIND_OPTIONS: { value: IncidentKind; label: string }[] = [
  { value: 'delay', label: 'Retraso / demora' },
  { value: 'vehicle_issue', label: 'Problema con el vehículo' },
  { value: 'client_absent', label: 'Cliente ausente / cerrado' },
  { value: 'cannot_pickup', label: 'No se puede colectar' },
  { value: 'other', label: 'Otra' },
];

export type IncidentReportSheetProps = {
  visible: boolean;
  defaultPhase?: IncidentPhase;
  onSubmit: (values: {
    phase: IncidentPhase;
    kind: IncidentKind;
    description: string;
  }) => Promise<void> | void;
  onClose: () => void;
};

export function IncidentReportSheet({
  visible,
  defaultPhase = 'in_transit',
  onSubmit,
  onClose,
}: IncidentReportSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [phase, setPhase] = useState<IncidentPhase>(defaultPhase);
  const [kind, setKind] = useState<IncidentKind>('delay');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  function resetAndClose() {
    setPhase(defaultPhase);
    setKind('delay');
    setDescription('');
    setBusy(false);
    onClose();
  }

  async function handleSubmit() {
    if (description.trim().length === 0) return;
    setBusy(true);
    try {
      await onSubmit({ phase, kind, description: description.trim() });
      setPhase(defaultPhase);
      setKind('delay');
      setDescription('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={resetAndClose} />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Informar novedad</Text>
            <Text style={styles.subtitle}>
              Contá qué está pasando. El depósito lo va a ver en tiempo real.
            </Text>

            <Text style={styles.sectionTitle}>Momento</Text>
            <View style={styles.optionList} accessibilityRole="radiogroup">
              {PHASE_OPTIONS.map((opt) => {
                const selected = phase === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setPhase(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={opt.label}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionActive,
                      pressed && !selected && styles.optionPressed,
                    ]}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={selected ? theme.colors.primary : theme.colors.muted}
                    />
                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Tipo</Text>
            <View style={styles.optionList} accessibilityRole="radiogroup">
              {KIND_OPTIONS.map((opt) => {
                const selected = kind === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setKind(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={opt.label}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionActive,
                      pressed && !selected && styles.optionPressed,
                    ]}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={selected ? theme.colors.primary : theme.colors.muted}
                    />
                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {kind === 'client_absent' || kind === 'cannot_pickup' ? (
              <Banner
                tone="warning"
                message="Este tipo de novedad marca la parada como omitida automáticamente."
                style={styles.warning}
              />
            ) : null}

            <Text style={styles.sectionTitle}>Descripción</Text>
            <Input
              style={styles.input}
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder="Detalles…"
              accessibilityLabel="Descripción"
            />

            <View style={styles.actions}>
              <Button
                variant="primary"
                size="lg"
                icon="alert-circle-outline"
                onPress={() => void handleSubmit()}
                disabled={busy || description.trim().length === 0}
              >
                {busy ? 'Enviando…' : 'Reportar'}
              </Button>
              <Button variant="ghost" onPress={resetAndClose} disabled={busy}>
                Cancelar
              </Button>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  const { colors, spacing, typography, touch, motion } = theme;
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: colors.scrim,
    },
    backdropTap: { flex: 1 },
    sheet: {
      backgroundColor: colors.surface,
      padding: spacing.xl,
      paddingBottom: spacing.xxl,
      borderTopLeftRadius: spacing.radiusCard,
      borderTopRightRadius: spacing.radiusCard,
      maxHeight: '85%',
    },
    title: { ...typography.title, color: colors.text },
    subtitle: { ...typography.body, color: colors.muted, marginTop: spacing.xs },
    sectionTitle: {
      ...typography.captionStrong,
      color: colors.text,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    optionList: { gap: spacing.sm },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: touch.min,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: spacing.radiusLg,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    optionActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    optionPressed: {
      backgroundColor: colors.overlay,
      opacity: motion.pressOpacitySoft,
    },
    optionText: { ...typography.body, color: colors.text, flex: 1 },
    optionTextActive: { ...typography.bodyStrong, color: colors.primary },
    warning: {
      marginTop: spacing.md,
    },
    input: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    actions: {
      gap: spacing.sm,
      marginTop: spacing.xl,
    },
  });
}
