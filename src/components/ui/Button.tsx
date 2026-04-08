import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { borderSubtle, useTheme, type AppTheme } from '@theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  children: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

type VariantStyle = {
  container: ViewStyle;
  labelColor: string;
  spinnerColor: string;
};

function variantStyles(theme: AppTheme, variant: Variant): VariantStyle {
  const { colors } = theme;
  switch (variant) {
    case 'secondary':
      return {
        container: {
          backgroundColor: colors.surface,
          borderColor: borderSubtle,
        },
        labelColor: colors.text,
        spinnerColor: colors.text,
      };
    case 'outline':
      return {
        container: {
          backgroundColor: 'transparent',
          borderColor: borderSubtle,
        },
        labelColor: colors.text,
        spinnerColor: colors.text,
      };
    case 'ghost':
      return {
        container: {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        },
        labelColor: colors.muted,
        spinnerColor: colors.muted,
      };
    case 'danger':
      return {
        container: {
          backgroundColor: colors.danger,
          borderColor: colors.danger,
        },
        labelColor: colors.text,
        spinnerColor: colors.text,
      };
    default:
      return {
        container: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        labelColor: colors.text,
        spinnerColor: colors.text,
      };
  }
}

function sizeStyles(theme: AppTheme, size: Size): { container: ViewStyle; label: TextStyle } {
  const { spacing, typography } = theme;
  switch (size) {
    case 'sm':
      return {
        container: {
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
          minHeight: 36,
        },
        label: typography.captionStrong,
      };
    case 'lg':
      return {
        container: {
          paddingVertical: spacing.md + 2,
          paddingHorizontal: spacing.xl,
          minHeight: 48,
        },
        label: typography.bodyStrong,
      };
    default:
      return {
        container: {
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          minHeight: 44,
        },
        label: typography.bodyStrong,
      };
  }
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
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

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        base.pressable,
        v.container,
        s.container,
        pressed && !isDisabled && base.pressed,
        isDisabled && base.disabled,
        style,
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={v.spinnerColor} size="small" />
      ) : (
        <Text style={[s.label, { color: v.labelColor }, textStyle]} numberOfLines={1}>
          {children}
        </Text>
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
    pressed: {
      opacity: motion.pressOpacityStrong,
      transform: [{ scale: motion.pressScale }],
    },
    disabled: {
      opacity: 0.5,
    },
  });
}
