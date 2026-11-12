import { forwardRef, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme, type AppTheme } from '@theme';

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInputInstance, InputProps>(function Input(
  { label, error, containerStyle, style, editable = true, onFocus, onBlur, ...inputProps },
  ref,
) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hasError = error != null && error !== '';
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label != null && label !== '' ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.colors.muted}
        selectionColor={theme.colors.primary}
        cursorColor={theme.colors.primary}
        editable={editable}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.inputFocused,
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
  const { colors, spacing, typography, touch } = t;
  return StyleSheet.create({
    wrapper: {
      gap: spacing.sm,
    },
    label: {
      ...typography.captionStrong,
      color: colors.text,
    },
    input: {
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: spacing.radiusLg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: touch.min,
    },
    inputFocused: {
      borderColor: colors.primary,
      borderWidth: 2,
      // Keeps the text from shifting when the border thickens.
      paddingHorizontal: spacing.lg - 1,
      paddingVertical: spacing.md - 1,
    },
    inputError: {
      borderColor: colors.danger,
      borderWidth: 2,
    },
    inputDisabled: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
    },
    error: {
      ...typography.caption,
      color: colors.danger,
    },
  });
}
