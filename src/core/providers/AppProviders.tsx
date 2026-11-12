import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@components/ToastHost';
import { AppUpdateBootstrap, AppUpdateOverlay } from '@core/app-update';
import { queryClient } from '@core/query/queryClient';
import { DriverTrackingBootstrap } from '@core/location/DriverTrackingBootstrap';
import { SyncBootstrap } from '@core/sync';
import { ThemeProvider, useNavigationTheme, useTheme } from '@theme';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ThemedRoot>{children}</ThemedRoot>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Lives inside ThemeProvider so the root view and navigator follow the active scheme. */
function ThemedRoot({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const navigationTheme = useNavigationTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavigationContainer theme={navigationTheme}>
        <SyncBootstrap />
        <AppUpdateBootstrap />
        <DriverTrackingBootstrap />
        {children}
      </NavigationContainer>
      <AppUpdateOverlay />
      <ToastHost />
    </View>
  );
}
