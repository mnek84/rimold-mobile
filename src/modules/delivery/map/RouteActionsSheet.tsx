import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@components/ui';
import { useTheme, type AppTheme } from '@theme';

export type RouteBusyAction = 'start' | 'reoptimize' | 'finish';

type Props = {
  visible: boolean;
  onClose: () => void;
  started: boolean;
  finished: boolean;
  startedAtLabel: string | null;
  busy: RouteBusyAction | null;
  etaLabel: string | null;
  error: string | null;
  onStart: () => void;
  onReoptimize: () => void;
  onFinish: () => void;
  insetBottom: number;
};

/**
 * Ciclo de vida de la ruta, fuera del mapa.
 *
 * Iniciar, re-optimizar y finalizar se tocan una vez por jornada cada una; el
 * mapa se mira todo el día. Tenerlas siempre a la vista le comía la mitad de la
 * pantalla a lo único que el chofer necesita mirar mientras maneja.
 */
export function RouteActionsSheet({
  visible,
  onClose,
  started,
  finished,
  startedAtLabel,
  busy,
  etaLabel,
  error,
  onStart,
  onReoptimize,
  onFinish,
  insetBottom,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const stateLine = finished
    ? 'Ruta finalizada'
    : started
      ? startedAtLabel !== null
        ? `En curso desde las ${startedAtLabel}`
        : 'Ruta en curso'
      : 'Ruta sin iniciar';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        style={styles.backdrop}
        onPress={onClose}
      >
        <Pressable style={[styles.panel, { paddingBottom: theme.spacing.lg + insetBottom }]} onPress={() => undefined}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Ionicons
              name={finished ? 'flag' : started ? 'navigate-circle' : 'play-circle'}
              size={22}
              color={finished ? theme.colors.muted : theme.colors.primary}
            />
            <Text style={styles.headerTitle}>{stateLine}</Text>
          </View>

          {etaLabel !== null ? <Text style={styles.eta}>{etaLabel}</Text> : null}
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            {!started && !finished ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  icon="play"
                  loading={busy === 'start'}
                  disabled={busy !== null}
                  onPress={onStart}
                >
                  Iniciar ruta
                </Button>
                <Text style={styles.hint}>
                  Al iniciar, todos los envíos de la ruta pasan a «En camino»: salieron del
                  depósito, aunque todavía no vayas hacia ninguno en particular.
                </Text>
              </>
            ) : null}

            {started && !finished ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  loading={busy === 'reoptimize'}
                  disabled={busy !== null}
                  onPress={onReoptimize}
                >
                  Re-optimizar recorrido
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  loading={busy === 'finish'}
                  disabled={busy !== null}
                  onPress={onFinish}
                >
                  Finalizar ruta
                </Button>
              </>
            ) : null}

            {finished ? (
              <Text style={styles.finishedHint}>
                Esta ruta ya está cerrada. Las entregas nuevas van a armar una ruta nueva.
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'flex-end',
    },
    panel: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: spacing.radiusCard,
      borderTopRightRadius: spacing.radiusCard,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: spacing.xs,
      borderRadius: spacing.xxs,
      backgroundColor: colors.border,
      marginBottom: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerTitle: {
      ...typography.subtitle,
      color: colors.text,
      flex: 1,
      minWidth: 0,
    },
    eta: {
      ...typography.body,
      color: colors.muted,
      marginTop: spacing.sm,
    },
    error: {
      ...typography.caption,
      color: colors.danger,
      marginTop: spacing.sm,
    },
    actions: {
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    hint: {
      ...typography.caption,
      color: colors.muted,
    },
    finishedHint: {
      ...typography.body,
      color: colors.muted,
    },
  });
}
