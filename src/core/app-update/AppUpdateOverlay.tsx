import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@components/ui';
import { useTheme } from '@theme';

import { useAppUpdateStore } from './appUpdateStore';

export function AppUpdateOverlay() {
  const theme = useTheme();
  const status = useAppUpdateStore((s) => s.status);
  const progress = useAppUpdateStore((s) => s.progress);
  const message = useAppUpdateStore((s) => s.message);
  const blocked = useAppUpdateStore((s) => s.blocked);
  const retryUpdate = useAppUpdateStore((s) => s.retryUpdate);

  const visible =
    blocked ||
    status === 'checking' ||
    status === 'downloading' ||
    status === 'installing' ||
    (status === 'error' && blocked);

  if (!visible) {
    return null;
  }

  const showProgress = status === 'downloading';
  const showRetry = status === 'error';

  return (
    <Modal animationType="fade" statusBarTranslucent transparent visible>
      <View
        style={[
          styles.backdrop,
          { backgroundColor: theme.colors.scrim, paddingHorizontal: theme.spacing.xl },
        ]}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.spacing.radiusCard,
              padding: theme.spacing.xl,
              gap: theme.spacing.lg,
            },
          ]}
        >
          <Text style={[styles.title, theme.typography.title, { color: theme.colors.text }]}>
            Actualizando aplicación
          </Text>

          {(status === 'checking' || status === 'installing') && (
            <ActivityIndicator size="large" color={theme.colors.primary} style={styles.spinner} />
          )}

          <Text style={[styles.body, theme.typography.body, { color: theme.colors.muted }]}>
            {message}
          </Text>

          {showProgress && (
            <View
              style={[
                styles.progressTrack,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderRadius: theme.spacing.radiusPill,
                },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.colors.primary,
                    borderRadius: theme.spacing.radiusPill,
                    width: `${Math.max(0, Math.min(100, progress))}%`,
                  },
                ]}
              />
            </View>
          )}

          {showRetry && (
            <Button
              size="lg"
              onPress={() => {
                void retryUpdate();
              }}
            >
              Reintentar
            </Button>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  spinner: {
    alignSelf: 'center',
  },
  progressTrack: {
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
});
