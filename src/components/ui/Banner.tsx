import { Ionicons } from '@expo/vector-icons';
import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { toneColors, useTheme, type AppTheme, type Tone } from '@theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const DEFAULT_ICON: Record<Tone, IoniconName> = {
  neutral: 'information-circle-outline',
  primary: 'information-circle-outline',
  brand: 'checkmark-circle-outline',
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  warning: 'warning-outline',
  danger: 'alert-circle-outline',
};

export type BannerProps = {
  tone?: Tone;
  title?: string;
  message?: string;
  icon?: IoniconName;
  /** Optional trailing slot (e.g. a small Button). */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Inline notice inside a screen: offline, scan result, permission missing, sync error. */
export function Banner({ tone = 'info', title, message, icon, action, style }: BannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const c = toneColors(theme, tone);

  return (
    <View
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: c.soft, borderColor: c.border }, style]}
    >
      <Ionicons name={icon ?? DEFAULT_ICON[tone]} size={22} color={c.ink} />
      <View style={styles.body}>
        {title != null && title !== '' ? (
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        ) : null}
        {message != null && message !== '' ? (
          <Text style={[styles.message, { color: theme.colors.text }]}>{message}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

function createStyles(t: AppTheme) {
  const { spacing, typography } = t;
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: spacing.radiusXl,
      borderWidth: StyleSheet.hairlineWidth,
    },
    body: {
      flex: 1,
      gap: spacing.xxs,
    },
    title: {
      ...typography.bodyStrong,
    },
    message: {
      ...typography.caption,
    },
  });
}
