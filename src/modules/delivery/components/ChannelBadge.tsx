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
        size={compact ? 11 : 13}
        color={flex ? FLEX_INK : theme.colors.primary}
      />
      <Text style={[styles.label, flex ? styles.labelFlex : styles.labelOwn, compact && styles.labelCompact]}>
        {channel.label}
      </Text>
    </View>
  );
}

/** Amarillo de marca ML sobre tinta oscura: contraste > 4.5:1 en ambos temas. */
const FLEX_BG = '#FFE600';
const FLEX_INK = '#1F2937';

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    pillCompact: {
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    pillFlex: {
      backgroundColor: FLEX_BG,
      borderColor: FLEX_BG,
    },
    pillOwn: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
    },
    label: {
      ...typography.captionStrong,
    },
    labelCompact: {
      fontSize: 11,
    },
    labelFlex: {
      color: FLEX_INK,
    },
    labelOwn: {
      color: colors.text,
    },
  });
}
