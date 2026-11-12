import { Ionicons } from '@expo/vector-icons';
import { useMemo, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useTheme, type AppTheme } from '@theme';

/**
 * - `primary`   navy fill. The one action a screen exists for. At most one per view.
 * - `success`   green fill. Confirming a positive outcome ("Entregado", "Confirmar colecta").
 * - `danger`    red fill. Destructive or failure outcomes ("No entregado", "Cerrar sesión").
 * - `secondary` neutral surface with a control border. Alternatives next to a primary.
 * - `outline`   transparent with a navy border + navy label. Secondary actions that still need brand weight.
 * - `dangerOutline` transparent with a red border + red label. A failure path offered next to the main
 *                 action ("Reportar paquete fallido") — present, but not competing with the primary.
 * - `ghost`     text-only. Tertiary actions ("Cancelar", "Ver más").
 */
export type ButtonVariant =
  | 'primary'
  | 'success'
  | 'danger'
  | 'secondary'
  | 'outline'
  | 'dangerOutline'
  | 'ghost';
/** sm = 40 (inline/toolbar only), md = 48 (default floor), lg = 56 (main action of the screen). */
export type ButtonSize = 'sm' | 'md' | 'lg';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Leading icon. Labels stay: an icon alone is not enough for a status-changing action. */
  icon?: IoniconName;
  /** Stretch to the container width (default for `lg`). */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

type VariantStyle = {
  container: ViewStyle;
  labelColor: string;
};

function variantStyles(theme: AppTheme, variant: ButtonVariant): VariantStyle {
  const { colors } = theme;
  switch (variant) {
    case 'success':
      return {
        container: { backgroundColor: colors.success, borderColor: colors.success },
        labelColor: colors.successOn,
      };
    case 'danger':
      return {
        container: { backgroundColor: colors.danger, borderColor: colors.danger },
        labelColor: colors.dangerOn,
      };
    case 'secondary':
      return {
        container: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
        labelColor: colors.text,
      };
    case 'outline':
      return {
        container: { backgroundColor: 'transparent', borderColor: colors.primary },
        labelColor: colors.primary,
      };
    case 'dangerOutline':
      return {
        container: { backgroundColor: 'transparent', borderColor: colors.danger },
        labelColor: colors.danger,
      };
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent', borderColor: 'transparent' },
        labelColor: colors.primary,
      };
    default:
      return {
        container: { backgroundColor: colors.primary, borderColor: colors.primary },
        labelColor: colors.primaryOn,
      };
  }
}

function sizeStyles(
  theme: AppTheme,
  size: ButtonSize,
): { container: ViewStyle; label: TextStyle; icon: number } {
  const { spacing, typography, touch } = theme;
  switch (size) {
    case 'sm':
      return {
        container: { paddingHorizontal: spacing.md, minHeight: 40 },
        label: typography.captionStrong,
        icon: 18,
      };
    case 'lg':
      return {
        container: { paddingHorizontal: spacing.xl, minHeight: touch.primary },
        label: typography.subtitle,
        icon: 22,
      };
    default:
      return {
        container: { paddingHorizontal: spacing.lg, minHeight: touch.min },
        label: typography.bodyStrong,
        icon: 20,
      };
  }
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth,
  disabled,
  style,
  textStyle,
  ...pressableProps
}: ButtonProps) {
  const theme = useTheme();
  const base = useMemo(() => createBaseStyles(theme), [theme]);
  const v = variantStyles(theme, variant);
  const s = sizeStyles(theme, size);
  const isDisabled = disabled === true || loading;
  const stretch = fullWidth ?? size === 'lg';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        base.pressable,
        v.container,
        s.container,
        stretch && base.fullWidth,
        pressed && !isDisabled && base.pressed,
        isDisabled && base.disabled,
        style,
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={v.labelColor} size="small" />
      ) : (
        <View style={base.content}>
          {icon != null ? <Ionicons name={icon} size={s.icon} color={v.labelColor} /> : null}
          <Text
            style={[s.label, { color: v.labelColor }, textStyle]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function createBaseStyles(t: AppTheme) {
  const { motion, spacing } = t;
  return StyleSheet.create({
    pressable: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: spacing.radiusLg,
      borderWidth: 1,
    },
    fullWidth: {
      alignSelf: 'stretch',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    pressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
    disabled: {
      opacity: motion.disabledOpacity,
    },
  });
}
