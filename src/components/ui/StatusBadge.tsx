import { Ionicons } from '@expo/vector-icons';
import { useMemo, type ComponentProps } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { toneColors, useTheme, type AppTheme, type Tone } from '@theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type StatusBadgeProps = {
  /** Always required: colour is never the only signal. */
  label: string;
  tone?: Tone;
  /** Recommended for statuses (checkmark, close, time…) so the state reads without colour. */
  icon?: IoniconName;
  /** `soft` (tinted, default) for lists; `solid` for the single most important status on a screen. */
  emphasis?: 'soft' | 'solid';
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export function StatusBadge({
  label,
  tone = 'neutral',
  icon,
  emphasis = 'soft',
  size = 'md',
  style,
}: StatusBadgeProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const c = toneColors(theme, tone);
  const solid = emphasis === 'solid';
  const fg = solid ? c.onSolid : c.ink;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        size === 'sm' && styles.badgeSm,
        { backgroundColor: solid ? c.solid : c.soft, borderColor: solid ? c.solid : c.border },
        style,
      ]}
    >
      {icon != null ? <Ionicons name={icon} size={size === 'sm' ? 12 : 14} color={fg} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { spacing, typography } = t;
  return StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs + 1,
      borderRadius: spacing.radiusSm,
      borderWidth: StyleSheet.hairlineWidth,
    },
    badgeSm: {
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: 1,
    },
    label: {
      ...typography.micro,
    },
  });
}
