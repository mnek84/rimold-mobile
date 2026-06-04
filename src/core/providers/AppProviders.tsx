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
import { ThemeProvider } from '@theme';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <View style={{ flex: 1 }}>
            <NavigationContainer>
              <SyncBootstrap />
              <AppUpdateBootstrap />
              <DriverTrackingBootstrap />
              {children}
            </NavigationContainer>
            <AppUpdateOverlay />
            <ToastHost />
          </View>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
