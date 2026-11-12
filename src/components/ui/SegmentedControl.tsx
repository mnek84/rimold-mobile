import { Ionicons } from '@expo/vector-icons';
import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type AppTheme } from '@theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: IoniconName;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Mutually exclusive choice among 2–4 options (filters, tabs within a screen, appearance). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors } = theme;

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.track, style]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const fg = selected ? colors.primaryOn : colors.text;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={opt.label}
            onPress={() => {
              if (!selected) onChange(opt.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            {opt.icon != null ? <Ionicons name={opt.icon} size={18} color={fg} /> : null}
            <Text style={[styles.label, { color: fg }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { colors, spacing, typography, touch } = t;
  return StyleSheet.create({
    track: {
      flexDirection: 'row',
      padding: spacing.xs,
      gap: spacing.xs,
      borderRadius: spacing.radiusLg,
      backgroundColor: colors.surfaceMuted,
    },
    segment: {
      flex: 1,
      minHeight: touch.min - spacing.xs * 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      paddingHorizontal: spacing.sm,
      borderRadius: spacing.radiusMd,
    },
    segmentSelected: {
      backgroundColor: colors.primary,
    },
    segmentPressed: {
      backgroundColor: colors.overlay,
    },
    label: {
      ...typography.captionStrong,
    },
  });
}
