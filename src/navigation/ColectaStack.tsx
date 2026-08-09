import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ClientSelectionScreen } from '@modules/colecta/ClientSelectionScreen';
import { ColectaHistoryScreen } from '@modules/colecta/ColectaHistoryScreen';
import { ColectaScanScreen } from '@modules/colecta/ColectaScanScreen';
import { PickupOrdersListScreen } from '@modules/pickups/screens/PickupOrdersListScreen';
import { PickupOrderPendingScreen } from '@modules/pickups/screens/PickupOrderPendingScreen';
import { PickupOrderInProgressScreen } from '@modules/pickups/screens/PickupOrderInProgressScreen';
import { PickupOrdersHistoryScreen } from '@modules/pickups/screens/PickupOrdersHistoryScreen';

import { useDriverNativeStackScreenOptions } from './nativeStackScreenOptions';
import type { ColectaStackParamList } from './colectaStackTypes';

const Stack = createNativeStackNavigator<ColectaStackParamList>();

export function ColectaStack() {
  const screenOptions = useDriverNativeStackScreenOptions();
  return (
    <Stack.Navigator
      initialRouteName="PickupOrdersList"
      screenOptions={screenOptions}
    >
      <Stack.Screen
        name="PickupOrdersList"
        component={PickupOrdersListScreen}
        options={{ title: 'Mis colectas' }}
      />
      <Stack.Screen
        name="PickupOrderPending"
        component={PickupOrderPendingScreen}
        options={{ title: 'Colecta asignada' }}
      />
      <Stack.Screen
        name="PickupOrderInProgress"
        component={PickupOrderInProgressScreen}
        options={{ title: 'Recorrido' }}
      />
      <Stack.Screen
        name="PickupOrdersHistory"
        component={PickupOrdersHistoryScreen}
        options={{ title: 'Historial' }}
      />
      <Stack.Screen
        name="ColectaScan"
        component={ColectaScanScreen}
        options={{ title: 'Escanear' }}
      />
      <Stack.Screen
        name="ClientSelection"
        component={ClientSelectionScreen}
        options={{ title: 'Colecta manual' }}
      />
      <Stack.Screen
        name="ColectaHistory"
        component={ColectaHistoryScreen}
        options={{ title: 'Historial (legacy)' }}
      />
    </Stack.Navigator>
  );
}
