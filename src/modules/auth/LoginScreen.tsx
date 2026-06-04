import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const logo = require('../../../assets/logo.png') as number;

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
      {/* Decorado de fondo — círculos de luz azul para dar profundidad */}
      <View style={styles.bgGlow1} />
      <View style={styles.bgGlow2} />
      <View style={styles.bgGlow3} />

      {/* Cuadrícula sutil estilo logística */}
      <View style={styles.bgGrid} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.bgGridLine, { top: `${i * 14}%` as unknown as number }]} />
        ))}
      </View>

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

            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
            />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
            />

            {error !== null ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={() => void onLogin()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.primaryOn} />
              ) : (
                <Text style={styles.buttonLabel}>Entrar</Text>
              )}
            </Pressable>

            {/* Separador */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>o</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.buttonQr, pressed && styles.buttonQrPressed]}
              onPress={() => setQrOpen(true)}
              disabled={submitting}
            >
              <Ionicons name="qr-code-outline" size={18} color={theme.colors.text} />
              <Text style={styles.buttonQrLabel}>Entrar con código QR</Text>
            </Pressable>
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
  const { colors, spacing, typography, motion } = t;
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

    // ── Fondo decorativo ───────────────────────────────────────────────
    bgGlow1: {
      position: 'absolute',
      width: 420,
      height: 420,
      borderRadius: 210,
      backgroundColor: 'rgba(37, 99, 235, 0.10)',
      top: -160,
      right: -120,
    },
    bgGlow2: {
      position: 'absolute',
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: 'rgba(37, 99, 235, 0.07)',
      bottom: -80,
      left: -80,
    },
    bgGlow3: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: 'rgba(37, 99, 235, 0.05)',
      top: '38%',
      left: '60%',
    },
    bgGrid: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
    },
    bgGridLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: 'rgba(148, 163, 184, 0.05)',
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
      // Sombra para elevación
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 20,
      elevation: 12,
    },
    cardTitle: {
      ...typography.subtitle,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusMd,
      paddingVertical: spacing.md + 2,
      paddingHorizontal: spacing.lg,
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    error: {
      color: colors.danger,
      ...typography.caption,
    },
    button: {
      marginTop: spacing.xs,
      paddingVertical: spacing.md + 2,
      borderRadius: spacing.radiusMd,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 6,
    },
    buttonPressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
    buttonLabel: {
      color: colors.primaryOn,
      ...typography.bodyStrong,
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
    buttonQr: {
      paddingVertical: spacing.md + 2,
      borderRadius: spacing.radiusMd,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: 50,
    },
    buttonQrPressed: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
    buttonQrLabel: {
      color: colors.text,
      ...typography.bodyStrong,
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
