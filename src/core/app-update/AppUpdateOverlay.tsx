import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { borderSubtle, useTheme } from '@theme';

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
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.78)' }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: borderSubtle,
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
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.colors.primary,
                    width: `${Math.max(0, Math.min(100, progress))}%`,
                  },
                ]}
              />
            </View>
          )}

          {showRetry && (
            <Pressable
              onPress={() => {
                void retryUpdate();
              }}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.buttonLabel, theme.typography.bodyStrong, { color: '#ffffff' }]}>
                Reintentar
              </Text>
            </Pressable>
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
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    lineHeight: 22,
  },
  spinner: {
    alignSelf: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(128,128,128,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonLabel: {
    textAlign: 'center',
  },
});
