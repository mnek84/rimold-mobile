import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DeliveryDetailScreen } from '@modules/delivery/DeliveryDetailScreen';
import { DeliveryListScreen } from '@modules/delivery/DeliveryListScreen';

import { driverNativeStackScreenOptions } from './nativeStackScreenOptions';
import type { DeliveryStackParamList } from './deliveryStackTypes';

const Stack = createNativeStackNavigator<DeliveryStackParamList>();

export function DeliveryStack() {
  return (
    <Stack.Navigator
      initialRouteName="DeliveryList"
      screenOptions={driverNativeStackScreenOptions}
    >
      <Stack.Screen name="DeliveryList" component={DeliveryListScreen} options={{ title: 'Entregas' }} />
      <Stack.Screen
        name="DeliveryDetail"
        component={DeliveryDetailScreen}
        options={{
          title: 'Entrega',
          headerBackTitle: 'Lista',
        }}
      />
    </Stack.Navigator>
  );
}
