import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CageListScreen } from '@modules/bodega/CageListScreen';
import { CageWorkspaceScreen } from '@modules/bodega/CageWorkspaceScreen';

import { useDriverNativeStackScreenOptions } from './nativeStackScreenOptions';
import type { BodegaStackParamList } from './bodegaStackTypes';

const Stack = createNativeStackNavigator<BodegaStackParamList>();

export function BodegaStack() {
  const screenOptions = useDriverNativeStackScreenOptions();
  return (
    <Stack.Navigator
      initialRouteName="CageList"
      screenOptions={screenOptions}
    >
      <Stack.Screen name="CageList" component={CageListScreen} options={{ title: 'Jaulas' }} />
      <Stack.Screen
        name="CageWorkspace"
        component={CageWorkspaceScreen}
        options={({ route }) => ({ title: route.params.cageName })}
      />
    </Stack.Navigator>
  );
}
