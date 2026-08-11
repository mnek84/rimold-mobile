import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@components/ui';
import { useCageDepartureAuthorization } from '@modules/bodega/hooks/useCageDepartureAuthorization';
import type { BodegaStackNav, BodegaStackRoute } from '@navigation/bodegaStackTypes';
import { useTheme, type AppTheme } from '@theme';

/**
 * Gate del chofer antes de iniciar recorrido: espera a que el supervisor
 * autorice la salida de la jaula. Mientras tanto muestra un spinner y
 * un mensaje; cuando llega la autorización (por Reverb o por refresh),
 * habilita el botón "Iniciar Recorrido".
 */
export function CageDepartureGateScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<BodegaStackNav<'CageDepartureGate'>>();
  const route = useRoute<BodegaStackRoute<'CageDepartureGate'>>();
  const { cageId, cageName, cageSessionId } = route.params;

  const { data, isLoading, live } = useCageDepartureAuthorization(cageId, cageSessionId);
  const authorized = data?.authorized === true;

  return (
    <ScreenContainer>
      <Text style={styles.title}>Salida de {cageName}</Text>
      <Text style={styles.subtitle}>
        Esperando autorización del supervisor para iniciar el recorrido.
      </Text>

      <View style={styles.statusBox}>
        {isLoading ? (
          <>
            <ActivityIndicator />
            <Text style={styles.statusText}>Consultando estado…</Text>
          </>
        ) : authorized ? (
          <>
            <Ionicons name="checkmark-circle" size={44} color={theme.colors.success} />
            <Text style={[styles.statusText, styles.statusOk]}>
              Autorizado — podés iniciar viaje.
            </Text>
            {data?.authorized_at ? (
              <Text style={styles.statusMeta}>
                Autorizado a las {new Date(data.authorized_at).toLocaleTimeString()}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.statusText}>
              Esperando OK del supervisor.
            </Text>
            <Text style={styles.statusMeta}>
              {live ? 'Conectado en vivo — llegará al toque.' : 'Reintentando cada 30s…'}
            </Text>
          </>
        )}
      </View>

      <Pressable
        style={[styles.cta, !authorized && styles.ctaDisabled]}
        disabled={!authorized}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="play" size={20} color="#ffffff" />
        <Text style={styles.ctaText}>Iniciar recorrido</Text>
      </Pressable>
    </ScreenContainer>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    title: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      ...typography.body,
      color: colors.muted,
      marginBottom: spacing.lg,
    },
    statusBox: {
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surface,
      marginBottom: spacing.lg,
    },
    statusText: {
      ...typography.bodyStrong,
      color: colors.text,
      textAlign: 'center',
    },
    statusOk: {
      color: colors.success,
    },
    statusMeta: {
      ...typography.caption,
      color: colors.muted,
      textAlign: 'center',
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.md,
      borderRadius: spacing.radiusLg,
    },
    ctaDisabled: {
      opacity: 0.4,
    },
    ctaText: {
      ...typography.bodyStrong,
      color: '#ffffff',
    },
  });
}
