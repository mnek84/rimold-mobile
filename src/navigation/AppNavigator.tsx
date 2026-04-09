import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { LoginScreen } from '@modules/auth/LoginScreen';
import { BodegaStack } from '@navigation/BodegaStack';
import { SettingsScreen, settingsTabBarIcon } from '@modules/settings/SettingsScreen';
import { ColectaStack } from '@navigation/ColectaStack';
import { DeliveryStack } from '@navigation/DeliveryStack';
import { DriverLocationPermissionGate } from '@core/location/DriverLocationPermissionGate';
import { useAuthStore } from '@store/useAuthStore';
import { borderSubtle, useTheme } from '@theme';

import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function colectaTabBarIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="cube-outline" size={size} color={color} />;
}

function entregasTabBarIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="car-outline" size={size} color={color} />;
}

export function AppNavigator() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const tabScreenOptions = useMemo(
    () => ({
      headerTitleAlign: 'center' as const,
      headerStyle: {
        backgroundColor: theme.colors.surface,
      },
      headerShadowVisible: false,
      headerTintColor: theme.colors.primary,
      headerTitleStyle: {
        ...theme.typography.bodyStrong,
        color: theme.colors.text,
      },
      tabBarLabelStyle: {
        fontSize: theme.typography.captionStrong.fontSize,
        fontWeight: theme.typography.captionStrong.fontWeight,
      },
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.muted,
      tabBarStyle: {
        borderTopColor: borderSubtle,
        backgroundColor: theme.colors.surface,
      },
    }),
    [theme],
  );

  // StatusBar siempre light — el contenido de la app es oscuro
  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <StatusBar style="light" />
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  if (!isAuthenticated || user === null) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen />
      </>
    );
  }

  if (user.role === 'DRIVER') {
    return (
      <>
        <StatusBar style="light" />
        <DriverLocationPermissionGate />
        <Tab.Navigator screenOptions={tabScreenOptions}>
          <Tab.Screen
            name="Colecta"
            component={ColectaStack}
            options={{
              headerShown: false,
              tabBarIcon: colectaTabBarIcon,
            }}
          />
          <Tab.Screen
            name="Entregas"
            component={DeliveryStack}
            options={{
              headerShown: false,
              tabBarIcon: entregasTabBarIcon,
            }}
          />
          <Tab.Screen
            name="Ajustes"
            component={SettingsScreen}
            options={{
              title: 'Ajustes',
              tabBarIcon: settingsTabBarIcon,
            }}
          />
        </Tab.Navigator>
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Tab.Navigator screenOptions={tabScreenOptions}>
        <Tab.Screen
          name="Bodega"
          component={BodegaStack}
          options={{
            headerShown: false,
            title: 'Depósito',
          }}
        />
        <Tab.Screen
          name="Ajustes"
          component={SettingsScreen}
          options={{
            title: 'Ajustes',
            tabBarIcon: settingsTabBarIcon,
          }}
        />
      </Tab.Navigator>
    </>
  );
}
