import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ReturnOrderInProgressScreen } from '@modules/returns/screens/ReturnOrderInProgressScreen';
import { ReturnOrderPendingScreen } from '@modules/returns/screens/ReturnOrderPendingScreen';
import { ReturnOrdersListScreen } from '@modules/returns/screens/ReturnOrdersListScreen';

import { useDriverNativeStackScreenOptions } from './nativeStackScreenOptions';
import type { ReturnStackParamList } from './returnStackTypes';

const Stack = createNativeStackNavigator<ReturnStackParamList>();

export function ReturnStack() {
  const screenOptions = useDriverNativeStackScreenOptions();
  return (
    <Stack.Navigator initialRouteName="ReturnOrdersList" screenOptions={screenOptions}>
      <Stack.Screen
        name="ReturnOrdersList"
        component={ReturnOrdersListScreen}
        options={{ title: 'Mis devoluciones' }}
      />
      <Stack.Screen
        name="ReturnOrderPending"
        component={ReturnOrderPendingScreen}
        options={{ title: 'Devolución asignada' }}
      />
      <Stack.Screen
        name="ReturnOrderInProgress"
        component={ReturnOrderInProgressScreen}
        options={{ title: 'Recorrido' }}
      />
    </Stack.Navigator>
  );
}
