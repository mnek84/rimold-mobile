import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ClientSelectionScreen } from '@modules/colecta/ClientSelectionScreen';
import { ColectaScanScreen } from '@modules/colecta/ColectaScanScreen';

import { driverNativeStackScreenOptions } from './nativeStackScreenOptions';
import type { ColectaStackParamList } from './colectaStackTypes';

const Stack = createNativeStackNavigator<ColectaStackParamList>();

export function ColectaStack() {
  return (
    <Stack.Navigator
      initialRouteName="ClientSelection"
      screenOptions={driverNativeStackScreenOptions}
    >
      <Stack.Screen
        name="ClientSelection"
        component={ClientSelectionScreen}
        options={{ title: 'Colecta' }}
      />
      <Stack.Screen
        name="ColectaScan"
        component={ColectaScanScreen}
        options={{ title: 'Escanear' }}
      />
    </Stack.Navigator>
  );
}
