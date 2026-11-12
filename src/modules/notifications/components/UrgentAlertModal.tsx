import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, type JSX } from 'react';
import { Modal, StyleSheet, Text, Vibration, View } from 'react-native';

import { Button } from '@components/ui';
import { useTheme, type AppTheme } from '@theme';

import { useAdminMessagesStore } from '../state/adminMessagesStore';

const URGENT_VIBRATION_PATTERN = [0, 500, 250, 500, 250, 500];

/**
 * Modal bloqueante que se muestra cuando el driver recibe un mensaje urgente
 * (por push o por Reverb). No se cierra con back button ni tap fuera —
 * fuerza al chofer a leer y confirmar con "Entendido".
 */
export function UrgentAlertModal(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const current = useAdminMessagesStore((s) => s.currentUrgent);
  const dismiss = useAdminMessagesStore((s) => s.dismissUrgent);

  useEffect(() => {
    if (current == null) return;
    try {
      Vibration.vibrate(URGENT_VIBRATION_PATTERN);
    } catch {
      /* Web / device sin vibrador: ignorar. */
    }
    return () => {
      try {
        Vibration.cancel();
      } catch {
        /* noop */
      }
    };
  }, [current]);

  return (
    <Modal
      visible={current != null}
      transparent
      animationType="fade"
      onRequestClose={() => {
        /* Bloqueado: no cerrar con back. Requiere tap explícito en "Entendido". */
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="warning" size={20} color={theme.colors.danger} />
            <Text style={styles.tag}>URGENTE</Text>
          </View>
          <View style={styles.content}>
            {current ? (
              <>
                <Text style={styles.title}>{current.title}</Text>
                <Text style={styles.body}>{current.body}</Text>
              </>
            ) : null}
            <Button variant="danger" size="lg" onPress={dismiss}>
              Entendido
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusCard,
      borderWidth: 2,
      borderColor: colors.danger,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.dangerSoft,
    },
    tag: {
      ...typography.captionStrong,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.danger,
    },
    content: {
      padding: spacing.lg,
    },
    title: {
      ...typography.subtitle,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    body: {
      ...typography.body,
      color: colors.text,
      marginBottom: spacing.lg,
    },
  });
}
