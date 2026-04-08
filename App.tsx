import { StatusBar } from 'expo-status-bar';

import { AppProviders } from '@core/providers/AppProviders';
import { AppNavigator } from '@navigation/AppNavigator';

export default function App() {
  return (
    <AppProviders>
      <AppNavigator />
      <StatusBar style="auto" />
    </AppProviders>
  );
}
