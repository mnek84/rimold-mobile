import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { theme } from '@theme';

/** Headers alineados con superficie oscura de la app (evita barra superior blanca por defecto). */
export const driverNativeStackScreenOptions: NativeStackNavigationOptions = {
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
};
