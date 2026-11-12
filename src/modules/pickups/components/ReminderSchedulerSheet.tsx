import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@components/ui';
import { useTheme, type AppTheme } from '@theme';

const OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 10, label: '10 min antes' },
  { minutes: 15, label: '15 min antes' },
  { minutes: 30, label: '30 min antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 90, label: '1 h 30 min antes' },
];

export type ReminderSchedulerSheetProps = {
  visible: boolean;
  scheduledTimeFrom: string | null;
  onSelect: (minutesBefore: number) => Promise<void> | void;
  onSkip: () => void;
  onClose: () => void;
};

export function ReminderSchedulerSheet({
  visible,
  scheduledTimeFrom,
  onSelect,
  onSkip,
  onClose,
}: ReminderSchedulerSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [busy, setBusy] = useState(false);

  async function choose(minutes: number) {
    setBusy(true);
    try {
      await onSelect(minutes);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Recordatorio</Text>
          <Text style={styles.subtitle}>
            {scheduledTimeFrom
              ? `La colecta empieza a las ${scheduledTimeFrom}. ¿Cuándo querés que te avise?`
              : 'La colecta no tiene horario definido, no se puede programar un recordatorio.'}
          </Text>

          {scheduledTimeFrom ? (
            <View style={styles.options}>
              {OPTIONS.map((opt) => (
                <Button
                  key={opt.minutes}
                  onPress={() => void choose(opt.minutes)}
                  disabled={busy}
                  variant="secondary"
                >
                  {opt.label}
                </Button>
              ))}
            </View>
          ) : null}

          <View style={styles.spacer} />
          <Button onPress={onSkip} variant="ghost" disabled={busy}>
            Sin recordatorio
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  const { colors, spacing, typography } = theme;
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
    },
    title: { ...typography.title, color: colors.text },
    subtitle: { ...typography.body, color: colors.muted, marginTop: spacing.xs },
    options: { marginTop: spacing.lg, gap: spacing.sm },
    spacer: { height: spacing.md },
  });
}
