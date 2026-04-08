import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@core/feedback/toastStore';
import { borderSubtle, useTheme } from '@theme';

/**
 * Renders brief toasts above the tab bar. Mount once under {@link ThemeProvider}.
 */
export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const message = useToastStore((s) => s.message);
  const visible = useToastStore((s) => s.visible);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : 4,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  if (message === null) {
    return null;
  }

  const { colors, spacing, typography } = theme;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          {
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.sm,
            opacity,
            transform: [{ translateY }],
            backgroundColor: colors.surface,
            borderRadius: spacing.radiusMd,
            borderColor: borderSubtle,
            paddingVertical: spacing.sm + 2,
            paddingHorizontal: spacing.md + 4,
          },
        ]}
      >
        <Text style={[typography.caption, { color: colors.text, textAlign: 'center' }]}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 400,
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 3,
  },
});
