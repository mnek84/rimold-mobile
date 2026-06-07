import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CageListScreen } from '@modules/bodega/CageListScreen';
import { CageSessionGateScreen } from '@modules/bodega/CageSessionGateScreen';
import { CageWorkspaceScreen } from '@modules/bodega/CageWorkspaceScreen';
import { CloseCageSessionScreen } from '@modules/bodega/CloseCageSessionScreen';

import { useDriverNativeStackScreenOptions } from './nativeStackScreenOptions';
import type { BodegaStackParamList } from './bodegaStackTypes';

const Stack = createNativeStackNavigator<BodegaStackParamList>();

export function BodegaStack() {
  const screenOptions = useDriverNativeStackScreenOptions();
  return (
    <Stack.Navigator
      initialRouteName="CageSessionGate"
      screenOptions={screenOptions}
    >
      <Stack.Screen
        name="CageSessionGate"
        component={CageSessionGateScreen}
        options={{ title: 'Sesión de jaulas' }}
      />
      <Stack.Screen name="CageList" component={CageListScreen} options={{ title: 'Jaulas' }} />
      <Stack.Screen
        name="CageWorkspace"
        component={CageWorkspaceScreen}
        options={({ route }) => ({ title: route.params.cageName })}
      />
      <Stack.Screen
        name="CloseCageSession"
        component={CloseCageSessionScreen}
        options={{ title: 'Cerrar sesión' }}
      />
    </Stack.Navigator>
  );
}
