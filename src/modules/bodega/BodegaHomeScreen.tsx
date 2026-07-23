import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@components/ui';
import type { BodegaStackNav } from '@navigation/bodegaStackTypes';
import { useTheme, type AppTheme } from '@theme';

export function BodegaHomeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<BodegaStackNav<'BodegaHome'>>();

  return (
    <ScreenContainer>
      <Text style={styles.title}>Depósito</Text>
      <Text style={styles.subtitle}>
        Elegí qué operación vas a realizar.
      </Text>

      <View style={styles.cards}>
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate('WarehouseEntry')}
          accessibilityRole="button"
        >
          <View style={styles.cardIconWrap}>
            <Ionicons name="cube-outline" size={28} color={theme.colors.primary} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Ingreso a depósito</Text>
            <Text style={styles.cardHint}>
              Escaneá los paquetes que llegan de la colecta para dejarlos ingresados.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.muted} />
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate('CageSessionGate')}
          accessibilityRole="button"
        >
          <View style={styles.cardIconWrap}>
            <Ionicons name="grid-outline" size={28} color={theme.colors.primary} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Sesión de jaulas</Text>
            <Text style={styles.cardHint}>
              Cargá jaulas con los paquetes ya ingresados y asigná conductores al cerrar.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.muted} />
        </Pressable>
      </View>
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
    cards: {
      gap: spacing.md,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: spacing.radiusLg,
    },
    cardIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '1A',
    },
    cardTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    cardTitle: {
      ...typography.subtitle,
      color: colors.text,
      marginBottom: 2,
    },
    cardHint: {
      ...typography.caption,
      color: colors.muted,
    },
  });
}
