import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { BodegaHomeScreen } from '@modules/bodega/BodegaHomeScreen';
import { CageListScreen } from '@modules/bodega/CageListScreen';
import { CageSessionGateScreen } from '@modules/bodega/CageSessionGateScreen';
import { CageWorkspaceScreen } from '@modules/bodega/CageWorkspaceScreen';
import { CloseCageSessionScreen } from '@modules/bodega/CloseCageSessionScreen';
import { CageDepartureGateScreen } from '@modules/bodega/CageDepartureGateScreen';
import { CrossdockManualScreen } from '@modules/bodega/CrossdockManualScreen';
import { WarehouseEntryScreen } from '@modules/bodega/WarehouseEntryScreen';

import { useDriverNativeStackScreenOptions } from './nativeStackScreenOptions';
import type { BodegaStackParamList } from './bodegaStackTypes';

const Stack = createNativeStackNavigator<BodegaStackParamList>();

export function BodegaStack() {
  const screenOptions = useDriverNativeStackScreenOptions();
  return (
    <Stack.Navigator
      initialRouteName="BodegaHome"
      screenOptions={screenOptions}
    >
      <Stack.Screen
        name="BodegaHome"
        component={BodegaHomeScreen}
        options={{ title: 'Depósito' }}
      />
      <Stack.Screen
        name="WarehouseEntry"
        component={WarehouseEntryScreen}
        options={{ title: 'Ingreso a depósito' }}
      />
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
      <Stack.Screen
        name="CrossdockManual"
        component={CrossdockManualScreen}
        options={{ title: 'Crossdocking manual' }}
      />
      <Stack.Screen
        name="CageDepartureGate"
        component={CageDepartureGateScreen}
        options={({ route }) => ({ title: `Salida — ${route.params.cageName}` })}
      />
    </Stack.Navigator>
  );
}
