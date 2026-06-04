import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useMemo } from 'react';

import { useTheme } from '@theme';

/** Headers alineados con la superficie activa (claro u oscuro segun el sistema). */
export function useDriverNativeStackScreenOptions(): NativeStackNavigationOptions {
  const theme = useTheme();
  return useMemo<NativeStackNavigationOptions>(
    () => ({
      headerTitleAlign: 'center',
      headerStyle: {
        backgroundColor: theme.colors.surface,
      },
      headerShadowVisible: false,
      headerTintColor: theme.colors.primary,
      headerTitleStyle: {
        ...theme.typography.bodyStrong,
        color: theme.colors.text,
      },
      animation: 'slide_from_right',
      animationDuration: theme.motion.stackTransitionMs,
    }),
    [theme],
  );
}
