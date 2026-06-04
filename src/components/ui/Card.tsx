import { useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { useTheme, type AppTheme } from '@theme';

type Padding = 'none' | 'sm' | 'md' | 'lg';

function cardPadding(t: AppTheme, padding: Padding): number {
  switch (padding) {
    case 'none':
      return 0;
    case 'sm':
      return t.spacing.md;
    case 'lg':
      return t.spacing.xl;
    default:
      return t.spacing.lg;
  }
}

export type CardProps = Omit<ViewProps, 'style'> & {
  children: React.ReactNode;
  /** Default `md` = 16px (theme `spacing.lg`). */
  padding?: Padding;
  style?: StyleProp<ViewStyle>;
  /** When set, the card is pressable with pressed feedback (lists, tappable blocks). */
  onPress?: () => void;
};

export function Card({ children, padding = 'md', style, onPress, ...viewProps }: CardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pad = cardPadding(theme, padding);

  const padStyle = pad > 0 ? { padding: pad } : null;
  const composedStyle = [styles.card, padStyle, style];

  if (onPress != null) {
    return (
      <Pressable
        {...viewProps}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [composedStyle, pressed && styles.pressed]}
        android_ripple={{ color: theme.colors.overlay }}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={composedStyle} {...viewProps}>
      {children}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, motion, elevation } = t;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: spacing.radiusCard,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...Platform.select({
        ios: {
          shadowColor: elevation.shadowColor,
          shadowOffset: { width: 0, height: elevation.shadowOffsetY },
          shadowOpacity: elevation.shadowOpacity,
          shadowRadius: elevation.shadowRadius,
        },
        android: {
          elevation: elevation.androidElevation,
        },
        default: {},
      }),
    },
    pressed: {
      opacity: motion.pressOpacitySoft,
      transform: [{ scale: motion.pressScale }],
    },
  });
}
