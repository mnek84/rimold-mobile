import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DeliveryDetailScreen } from '@modules/delivery/DeliveryDetailScreen';
import { DeliveryListScreen } from '@modules/delivery/DeliveryListScreen';
import { FlexBatchMapScreen } from '@modules/delivery/FlexBatchMapScreen';
import { InternalRouteScreen } from '@modules/delivery/InternalRouteScreen';

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
      <Stack.Screen
        name="InternalRoute"
        component={InternalRouteScreen}
        options={{ title: 'Ruta interna', headerBackTitle: 'Lista' }}
      />
      <Stack.Screen
        name="FlexBatchMap"
        component={FlexBatchMapScreen}
        options={{ title: 'Flex', headerBackTitle: 'Lista' }}
      />
    </Stack.Navigator>
  );
}
