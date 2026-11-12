import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

import { shipmentDriverPhaseIndex } from '../deliveryStatus';
import { OpenFlexAppButton } from './OpenFlexAppButton';

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

  const phase = shipmentDriverPhaseIndex(statusCode);
  const arrived = phase === 2;
  const closed = phase === 3;

  const title = closed
    ? 'Entrega registrada por Mercado Libre'
    : arrived
      ? 'Llegaste: confirmá la entrega en Mercado Libre Flex'
      : 'Envío de Mercado Libre Flex';

  const body = closed
    ? 'Mercado Libre informó el resultado de este envío.'
    : 'La entrega se confirma en la app Mercado Libre Flex, no en ésta. Cuando Mercado Libre la informe, el estado se actualiza solo acá.';

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
              ? `Último estado informado por Mercado Libre: ${externalStatus}`
              : 'Mercado Libre todavía no informó un estado.'}
          </Text>
        </View>
      </View>

      {!closed ? <OpenFlexAppButton variant={arrived ? 'primary' : 'outline'} size={arrived ? 'lg' : 'md'} /> : null}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
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
      borderRadius: spacing.radiusPill,
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
      gap: spacing.xxs,
    },
    title: {
      ...typography.bodyStrong,
      color: colors.text,
    },
    body: {
      ...typography.caption,
      color: colors.muted,
    },
  });
}
