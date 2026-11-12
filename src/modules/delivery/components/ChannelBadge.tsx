import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ShipmentChannel } from '@core/api/channel';
import { useTheme, type AppTheme } from '@theme';

/**
 * Canal del envío en una píldora: "Propio", "Flex · Residencial",
 * "Flex · Comercial", "Tiendanube".
 *
 * El texto viene del backend (`channel.label`), no se arma acá: si mañana hay
 * otro canal, aparece sin tocar la app. El color sólo separa "lo opero yo"
 * (propio / Tiendanube) de "lo opera Mercado Libre" (Flex), que es la
 * distinción que cambia lo que el chofer puede hacer con el paquete; el ícono
 * repite esa información para quien no distingue el color.
 */
export function ChannelBadge({ channel, compact = false }: { channel: ShipmentChannel; compact?: boolean }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const flex = channel.operator === 'mercadolibre_flex';

  return (
    <View
      style={[styles.pill, flex ? styles.pillFlex : styles.pillOwn, compact && styles.pillCompact]}
      accessibilityRole="text"
      accessibilityLabel={`Canal: ${channel.label}`}
    >
      <Ionicons
        name={flex ? 'swap-horizontal' : 'cube-outline'}
        size={compact ? 12 : 14}
        color={flex ? theme.colors.partnerFlexOn : theme.colors.primary}
      />
      <Text
        style={[styles.label, flex ? styles.labelFlex : styles.labelOwn, compact && styles.labelCompact]}
        maxFontSizeMultiplier={1.3}
      >
        {channel.label}
      </Text>
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  // Amarillo de marca ML sobre tinta oscura (`partnerFlex*`): contraste > 4.5:1 en ambos temas.
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      borderRadius: spacing.radiusPill,
      borderWidth: 1,
    },
    pillCompact: {
      paddingHorizontal: spacing.xs + spacing.xxs,
      paddingVertical: 1,
    },
    pillFlex: {
      backgroundColor: colors.partnerFlex,
      borderColor: colors.partnerFlex,
    },
    pillOwn: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
    },
    label: {
      ...typography.captionStrong,
    },
    labelCompact: {
      ...typography.micro,
    },
    labelFlex: {
      color: colors.partnerFlexOn,
    },
    labelOwn: {
      color: colors.text,
    },
  });
}
