import { forwardRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { borderSubtle, useTheme, type AppTheme } from '@theme';

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, containerStyle, style, editable = true, ...inputProps },
  ref,
) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hasError = error != null && error !== '';

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label != null && label !== '' ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.colors.muted}
        editable={editable}
        style={[
          styles.input,
          hasError && styles.inputError,
          !editable && styles.inputDisabled,
          style,
        ]}
        {...inputProps}
      />
      {hasError ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

function createStyles(t: AppTheme) {
  const { colors, spacing, typography } = t;
  return StyleSheet.create({
    wrapper: {
      gap: spacing.sm,
    },
    label: {
      ...typography.captionStrong,
      color: colors.muted,
    },
    input: {
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: borderSubtle,
      borderRadius: spacing.radiusLg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: 48,
    },
    inputError: {
      borderColor: colors.danger,
    },
    inputDisabled: {
      opacity: 0.55,
    },
    error: {
      ...typography.caption,
      color: colors.danger,
    },
  });
}
