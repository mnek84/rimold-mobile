import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { showToast } from '@core/feedback/toastStore';
import { useTheme, type AppTheme } from '@theme';

import { canOpenFlexApp, openMercadoFlexApp } from '../flexApp';
import { shipmentDriverPhaseIndex } from '../deliveryStatus';

type Props = {
  /** `status_code` efectivo del envío (incluye el optimista de la cola offline). */
  statusCode: string | null;
  /** Último estado que informó Mercado Libre (`shipped`, `delivered`…), si llegó. */
  externalStatus?: string | null;
};

/**
 * Avisa que la entrega se cierra en Mercado Flex y abre la app.
 *
 * La constancia de entrega de un envío Flex —nombre, DNI, firma— la toma la
 * app de Mercado Libre, no ésta. Un repartidor que no lo sabe llega al
 * domicilio, entrega, y recién en el auto descubre que le falta registrarlo en
 * otro lado; uno que lo sabe tarde vuelve a tocar el timbre. Por eso el aviso
 * aparece desde que el envío sale a reparto y se vuelve la acción principal
 * cuando llega: el momento en que el dato pasa de informativo a urgente es el
 * mismo en que el chofer está parado frente a la puerta.
 */
export function FlexHandoffCard({ statusCode, externalStatus = null }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [opening, setOpening] = useState(false);

  const phase = shipmentDriverPhaseIndex(statusCode);
  const arrived = phase === 2;
  const closed = phase === 3;
  const launchable = canOpenFlexApp();

  const onPress = useCallback(async () => {
    setOpening(true);
    try {
      const outcome = await openMercadoFlexApp();
      if (outcome === 'store') {
        showToast('Mercado Flex no está instalada. Te llevamos a la tienda.');
      } else if (outcome === 'unavailable') {
        showToast('No pudimos abrir Mercado Flex desde acá.');
      } else if (outcome === 'unsupported') {
        showToast('Abrí Mercado Flex desde la pantalla de inicio para cerrar esta entrega.');
      }
    } finally {
      setOpening(false);
    }
  }, []);

  const title = arrived ? 'Llegaste: cerrá la entrega en Flex' : 'Entrega de Mercado Flex';

  const body = closed
    ? 'La constancia de entrega de este envío la registró Mercado Flex.'
    : arrived
      ? 'La firma y el DNI del comprador se cargan en la app de Mercado Flex, no en ésta.'
      : 'Al llegar al domicilio, la constancia se registra en la app de Mercado Flex.';

  return (
    <View style={[styles.card, arrived && styles.cardArrived]}>
      <View style={styles.headerRow}>
        <View style={[styles.badge, arrived && styles.badgeArrived]}>
          <Ionicons
            name={arrived ? 'location' : 'swap-horizontal'}
            size={18}
            color={arrived ? theme.colors.primaryOn : theme.colors.primary}
          />
        </View>
        <View style={styles.headerTexts}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {/* El estado que informó ML, tal cual: es la fuente de verdad de un Flex. */}
          <Text style={styles.body}>
            {externalStatus !== null
              ? `Estado en Mercado Libre: ${externalStatus}`
              : 'Mercado Libre todavía no informó un estado.'}
          </Text>
        </View>
      </View>

      {launchable && !closed ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Abrir la app de Mercado Flex"
          accessibilityState={{ busy: opening }}
          disabled={opening}
          onPress={() => void onPress()}
          style={({ pressed }) => [
            arrived ? styles.ctaStrong : styles.ctaSoft,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="open-outline"
            size={18}
            color={arrived ? theme.colors.primaryOn : theme.colors.primary}
          />
          <Text style={arrived ? styles.ctaStrongLabel : styles.ctaSoftLabel}>
            {opening ? 'Abriendo…' : 'Abrir Mercado Flex'}
          </Text>
        </Pressable>
      ) : null}

      {!launchable && !closed ? (
        <Text style={styles.unsupported}>
          En {Platform.OS === 'ios' ? 'iOS' : 'esta plataforma'} abrí Mercado Flex desde la pantalla
          de inicio: no tenemos un enlace directo verificado.
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    card: {
      padding: spacing.lg,
      borderRadius: spacing.radiusCard,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.md,
    },
    cardArrived: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    headerRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    badge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    badgeArrived: {
      backgroundColor: colors.primary,
    },
    headerTexts: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    body: {
      ...typography.caption,
      color: colors.muted,
    },
    ctaStrong: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 50,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.primary,
    },
    ctaStrongLabel: {
      ...typography.bodyStrong,
      fontSize: 17,
      color: colors.primaryOn,
    },
    ctaSoft: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 44,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    ctaSoftLabel: {
      ...typography.bodyStrong,
      color: colors.primary,
    },
    unsupported: {
      ...typography.caption,
      color: colors.muted,
    },
    pressed: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
  });
}
