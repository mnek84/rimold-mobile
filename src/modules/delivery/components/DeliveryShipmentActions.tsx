import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

import { DELIVERY_DETAIL_ACTIONS } from '../deliveryDetailActions';
import { isDriverActionEnabled, type DriverActionKey } from '../deliveryStatus';

type Props = {
  effectiveStatusCode: string | null;
  onAction: (key: DriverActionKey) => void;
};

type ActionVariant = 'primary' | 'secondary' | 'success' | 'danger';

function actionLook(
  t: AppTheme,
  variant: ActionVariant,
): { backgroundColor: string; borderColor: string; labelColor: string } {
  const { colors } = t;
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        labelColor: '#f8fafc',
      };
    case 'secondary':
      return {
        backgroundColor: colors.surface,
        borderColor: colors.muted,
        labelColor: colors.text,
      };
    case 'success':
      return {
        backgroundColor: colors.success,
        borderColor: colors.success,
        labelColor: colors.background,
      };
    case 'danger':
      return {
        backgroundColor: colors.danger,
        borderColor: colors.danger,
        labelColor: '#ffffff',
      };
  }
}

export function DeliveryShipmentActions({ effectiveStatusCode, onAction }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View>
      <Text style={styles.actionsHeading}>Acciones</Text>
      <View style={styles.buttonStack}>
      {DELIVERY_DETAIL_ACTIONS.map((action) => {
        const enabled = isDriverActionEnabled(action.key, effectiveStatusCode);
        const look = actionLook(theme, action.variant);
        return (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled }}
            disabled={!enabled}
            hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
            android_ripple={
              enabled ? { color: 'rgba(255, 255, 255, 0.2)', foreground: false } : undefined
            }
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: look.backgroundColor,
                borderColor: look.borderColor,
              },
              !enabled && styles.actionBtnDisabled,
              enabled && pressed && styles.actionBtnPressed,
            ]}
            onPress={() => onAction(action.key)}
          >
            <Text
              style={[
                styles.actionBtnLabel,
                { color: look.labelColor },
                !enabled && styles.actionBtnLabelDisabled,
              ]}
            >
              {action.label}
            </Text>
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
    actionsHeading: {
      ...typography.subtitle,
      color: colors.text,
      marginBottom: spacing.md,
    },
    buttonStack: {
      gap: spacing.lg,
    },
    actionBtn: {
      width: '100%',
      minHeight: 56,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: spacing.radiusCard,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        },
        android: {
          elevation: 2,
        },
        default: {},
      }),
    },
    actionBtnDisabled: {
      opacity: 0.4,
    },
    actionBtnPressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
    actionBtnLabel: {
      ...typography.bodyStrong,
      textAlign: 'center',
    },
    actionBtnLabelDisabled: {
      color: colors.muted,
    },
  });
}
