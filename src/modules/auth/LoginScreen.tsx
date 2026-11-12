import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const logo = require('../../../assets/logo.png') as number;

import { Button, Input } from '@components/ui';
import { getAuthErrorMessage, login } from '@core/api/auth';
import { useAuthStore } from '@store/useAuthStore';
import { useTheme, type AppTheme } from '@theme';

import { LoginQrScannerModal } from './LoginQrScannerModal';

export function LoginScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const onLogin = useCallback(async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Ingresa correo y contraseña.');
      return;
    }
    setSubmitting(true);
    try {
      const { token, user } = await login({ email: trimmed, password });
      setSession(token, user);
    } catch (e) {
      setError(getAuthErrorMessage(e, 'No se pudo iniciar sesión.'));
    } finally {
      setSubmitting(false);
    }
  }, [email, password, setSession]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Área de logo / branding */}
          <View style={styles.logoArea}>
            <Image source={logo} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.appTagline}>Gestión de entregas y depósito</Text>
          </View>

          {/* Card de login */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar sesión</Text>

            <Input
              placeholder="Correo electrónico"
              accessibilityLabel="Correo electrónico"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
            />
            <Input
              placeholder="Contraseña"
              accessibilityLabel="Contraseña"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
            />

            {error !== null ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              size="lg"
              loading={submitting}
              onPress={() => void onLogin()}
              style={styles.submit}
            >
              Entrar
            </Button>

            {/* Separador */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>o</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              variant="secondary"
              icon="qr-code-outline"
              fullWidth
              onPress={() => setQrOpen(true)}
              disabled={submitting}
            >
              Entrar con código QR
            </Button>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Ionicons name="shield-checkmark-outline" size={13} color={theme.colors.muted} />
            <Text style={styles.footerText}>Acceso seguro</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <LoginQrScannerModal
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        onLoggedIn={(token, user) => {
          setSession(token, user);
        }}
      />
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, elevation } = t;
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeArea: {
      flex: 1,
    },
    flex: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },

    // ── Logo ──────────────────────────────────────────────────────────
    logoArea: {
      alignItems: 'center',
      marginBottom: spacing.xxl,
    },
    logoImage: {
      width: 220,
      height: 80,
      marginBottom: spacing.md,
    },
    appTagline: {
      ...typography.caption,
      color: colors.muted,
      letterSpacing: 0.2,
    },

    // ── Card ──────────────────────────────────────────────────────────
    card: {
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      gap: spacing.md,
      shadowColor: elevation.shadowColor,
      shadowOffset: { width: 0, height: elevation.shadowOffsetY },
      shadowOpacity: elevation.shadowOpacity,
      shadowRadius: elevation.shadowRadius,
      elevation: elevation.androidElevation,
    },
    cardTitle: {
      ...typography.subtitle,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    error: {
      color: colors.danger,
      ...typography.caption,
    },
    submit: {
      marginTop: spacing.xs,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.xs,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerLabel: {
      ...typography.caption,
      color: colors.muted,
      marginHorizontal: spacing.md,
    },

    // ── Footer ────────────────────────────────────────────────────────
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.xl,
    },
    footerText: {
      ...typography.caption,
      color: colors.muted,
    },
  });
}
