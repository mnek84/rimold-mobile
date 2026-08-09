import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@components/ui';
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
            <View style={styles.chipRow}>
              {PHASE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setPhase(opt.value)}
                  style={[styles.chip, phase === opt.value && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      phase === opt.value && styles.chipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Tipo</Text>
            <View style={styles.chipRow}>
              {KIND_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setKind(opt.value)}
                  style={[styles.chip, kind === opt.value && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      kind === opt.value && styles.chipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {kind === 'client_absent' || kind === 'cannot_pickup' ? (
              <Text style={styles.warning}>
                Este tipo de novedad marca la parada como omitida automáticamente.
              </Text>
            ) : null}

            <Text style={styles.sectionTitle}>Descripción</Text>
            <TextInput
              style={styles.input}
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder="Detalles…"
              placeholderTextColor={theme.colors.muted}
            />

            <View style={styles.actions}>
              <Button variant="ghost" onPress={resetAndClose} disabled={busy}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onPress={() => void handleSubmit()}
                disabled={busy || description.trim().length === 0}
              >
                {busy ? 'Enviando…' : 'Reportar'}
              </Button>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    backdropTap: { flex: 1 },
    sheet: {
      backgroundColor: theme.colors.surface,
      padding: 20,
      paddingBottom: 32,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: '85%',
    },
    title: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    subtitle: { fontSize: 14, color: theme.colors.muted, marginTop: 6 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: 16,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    chipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipText: { fontSize: 13, color: theme.colors.text },
    chipTextActive: { color: theme.colors.primaryOn, fontWeight: '600' },
    warning: {
      fontSize: 12,
      color: '#b45309',
      marginTop: 8,
      fontStyle: 'italic',
    },
    input: {
      minHeight: 80,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceMuted,
      padding: 10,
      borderRadius: 8,
      fontSize: 14,
      textAlignVertical: 'top',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 20,
    },
  });
}
