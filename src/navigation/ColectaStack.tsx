import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ClientSelectionScreen } from '@modules/colecta/ClientSelectionScreen';
import { ColectaHistoryScreen } from '@modules/colecta/ColectaHistoryScreen';
import { ColectaScanScreen } from '@modules/colecta/ColectaScanScreen';

import { useDriverNativeStackScreenOptions } from './nativeStackScreenOptions';
import type { ColectaStackParamList } from './colectaStackTypes';

const Stack = createNativeStackNavigator<ColectaStackParamList>();

export function ColectaStack() {
  const screenOptions = useDriverNativeStackScreenOptions();
  return (
    <Stack.Navigator
      initialRouteName="ClientSelection"
      screenOptions={screenOptions}
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
      <Stack.Screen
        name="ColectaHistory"
        component={ColectaHistoryScreen}
        options={{ title: 'Historial' }}
      />
    </Stack.Navigator>
  );
}
