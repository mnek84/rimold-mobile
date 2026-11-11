import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

import { DELIVERY_DETAIL_ACTIONS } from '../deliveryDetailActions';
import { isDriverActionEnabled, type DriverActionKey } from '../deliveryStatus';

type Props = {
  effectiveStatusCode: string | null;
  onAction: (key: DriverActionKey) => void;
  /** `channel.driver_actions_allowed`; false en Flex (el estado lo informa Mercado Libre). */
  driverActionsAllowed?: boolean;
};

type ActionVariant = 'primary' | 'secondary' | 'success' | 'danger';

const ACTION_ICONS: Record<DriverActionKey, keyof typeof Ionicons.glyphMap> = {
  en_camino: 'navigate',
  cerca: 'location',
  entregado: 'checkmark-circle',
  fallido: 'close-circle',
};

type ActionLook = {
  backgroundColor: string;
  iconColor: string;
  labelColor: string;
  sublabelColor: string;
  shadowColor: string;
};

function actionLook(t: AppTheme, variant: ActionVariant, enabled: boolean): ActionLook {
  const { colors } = t;

  if (!enabled) {
    return {
      backgroundColor: colors.surface,
      iconColor: colors.muted,
      labelColor: colors.muted,
      sublabelColor: 'transparent',
      shadowColor: 'transparent',
    };
  }

  switch (variant) {
    case 'primary':
      return {
        backgroundColor: colors.primary,
        iconColor: colors.primaryOn,
        labelColor: colors.primaryOn,
        sublabelColor: colors.primaryOn,
        shadowColor: colors.primary,
      };
    case 'secondary':
      return {
        backgroundColor: colors.surfaceMuted,
        iconColor: colors.text,
        labelColor: colors.text,
        sublabelColor: colors.muted,
        shadowColor: colors.text,
      };
    case 'success':
      return {
        backgroundColor: colors.success,
        iconColor: colors.successOn,
        labelColor: colors.successOn,
        sublabelColor: colors.successOn,
        shadowColor: colors.success,
      };
    case 'danger':
      return {
        backgroundColor: colors.danger,
        iconColor: colors.dangerOn,
        labelColor: colors.dangerOn,
        sublabelColor: colors.dangerOn,
        shadowColor: colors.danger,
      };
  }
}

export function DeliveryShipmentActions({ effectiveStatusCode, onAction, driverActionsAllowed = true }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Flex: no se ofrecen botones que el servidor no va a aplicar. Mostrarlos
  // deshabilitados sin explicación sería peor que no mostrarlos.
  if (!driverActionsAllowed) {
    return (
      <View accessibilityRole="text">
        <Text style={styles.sectionLabel}>ACCIONES DEL ENVÍO</Text>
        <Text style={styles.readOnlyNote}>
          Este envío se entrega con la app de Mercado Libre Flex. El estado se actualiza solo cuando Mercado
          Libre lo informa: desde esta app no se puede marcar en camino, entregado ni fallido.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>ACCIONES DEL ENVÍO</Text>
      <View style={styles.buttonStack}>
        {DELIVERY_DETAIL_ACTIONS.map((action) => {
          const enabled = isDriverActionEnabled(action.key, effectiveStatusCode, driverActionsAllowed);
          const look = actionLook(theme, action.variant, enabled);
          const iconName = ACTION_ICONS[action.key];

          return (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={`${action.label}: ${action.sublabel}`}
              accessibilityState={{ disabled: !enabled }}
              disabled={!enabled}
              android_ripple={
                enabled ? { color: 'rgba(255,255,255,0.12)', foreground: true } : undefined
              }
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: look.backgroundColor },
                enabled && {
                  ...Platform.select({
                    ios: {
                      shadowColor: look.shadowColor,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.45,
                      shadowRadius: 8,
                    },
                    android: { elevation: 5 },
                    default: {},
                  }),
                },
                !enabled && styles.actionBtnDisabled,
                enabled && pressed && styles.actionBtnPressed,
              ]}
              onPress={() => onAction(action.key)}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={iconName} size={28} color={look.iconColor} />
              </View>
              <View style={styles.textBlock}>
                <Text style={[styles.actionLabel, { color: look.labelColor }]}>
                  {action.label}
                </Text>
                {enabled ? (
                  <Text style={[styles.actionSublabel, { color: look.sublabelColor }]}>
                    {action.sublabel}
                  </Text>
                ) : null}
              </View>
              {enabled ? (
                <Ionicons name="chevron-forward" size={18} color={look.iconColor} style={styles.chevron} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, motion } = t;
  return StyleSheet.create({
    sectionLabel: {
      ...typography.captionStrong,
      color: colors.muted,
      letterSpacing: 1,
      marginBottom: spacing.md,
    },
    readOnlyNote: {
      ...typography.body,
      color: colors.muted,
    },
    buttonStack: {
      gap: spacing.sm,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 68,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.radiusLg,
      overflow: 'hidden',
    },
    actionBtnDisabled: {
      opacity: 0.28,
    },
    actionBtnPressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
    iconWrap: {
      width: 40,
      alignItems: 'center',
      marginRight: spacing.md,
    },
    textBlock: {
      flex: 1,
      gap: 2,
    },
    actionLabel: {
      fontSize: 17,
      fontWeight: '700' as const,
      lineHeight: 22,
    },
    actionSublabel: {
      ...typography.caption,
    },
    chevron: {
      marginLeft: spacing.sm,
      opacity: 0.7,
    },
  });
}
