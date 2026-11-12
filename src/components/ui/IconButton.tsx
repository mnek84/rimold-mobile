import { Ionicons } from '@expo/vector-icons';
import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type IconButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  icon: IoniconName;
  /** Required: an icon-only control has no visible label, so screen readers need one. */
  accessibilityLabel: string;
  /**
   * - `plain`   icon only on the current surface (toolbars, headers)
   * - `surface` round surface chip with border (floating over a map)
   * - `primary` navy filled (the main floating action)
   * - `onChrome` translucent control placed on the navy brand bar (`colors.chrome`)
   */
  variant?: 'plain' | 'surface' | 'primary' | 'onChrome';
  /** Visual diameter. The touch target is always ≥ 48. */
  size?: 40 | 48 | 56;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  variant = 'plain',
  size = 48,
  color,
  disabled,
  style,
  ...pressableProps
}: IconButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, touch } = theme;

  const look: { bg: string; border: string; fg: string } = (() => {
    switch (variant) {
      case 'surface':
        return { bg: colors.surface, border: colors.border, fg: colors.text };
      case 'primary':
        return { bg: colors.primary, border: colors.primary, fg: colors.primaryOn };
      case 'onChrome':
        return { bg: colors.chromeControl, border: 'transparent', fg: colors.chromeOn };
      default:
        return { bg: 'transparent', border: 'transparent', fg: colors.text };
    }
  })();

  const slop = Math.max(0, (touch.min - size) / 2);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      hitSlop={slop > 0 ? { top: slop, bottom: slop, left: slop, right: slop } : undefined}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: look.bg, borderColor: look.border },
        variant === 'surface' && styles.raised,
        pressed && styles.pressed,
        disabled === true && styles.disabled,
        style,
      ]}
      {...pressableProps}
    >
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={color ?? look.fg} />
    </Pressable>
  );
}

function createStyles(t: AppTheme) {
  const { motion, elevation } = t;
  return StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
    },
    raised: {
      shadowColor: elevation.shadowColor,
      shadowOffset: { width: 0, height: elevation.shadowOffsetY },
      shadowOpacity: elevation.shadowOpacity * 2,
      shadowRadius: elevation.shadowRadius,
      elevation: elevation.androidElevation + 2,
    },
    pressed: {
      opacity: motion.pressOpacitySoft,
    },
    disabled: {
      opacity: motion.disabledOpacity,
    },
  });
}
