import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import {
  canLaunchFlexOn,
  FLEX_ANDROID_PACKAGE,
  launchFlexApp,
  type FlexAppOpenOutcome,
} from './flexAppLauncher';

/**
 * Paquete Android de Mercado Libre Flex (la app del repartidor). Replicado en
 * `plugins/withFlexAppQuery.js`, que lo declara en `<queries>` del manifiesto:
 * sin esa declaración Android 11+ esconde la app instalada y esto cae siempre
 * a Google Play. La lógica (y qué está verificado) vive en `flexAppLauncher.ts`.
 */
export { FLEX_ANDROID_PACKAGE };
export type { FlexAppOpenOutcome };

export function canOpenFlexApp(): boolean {
  return canLaunchFlexOn(Platform.OS);
}

/** Abre Mercado Libre Flex, o su ficha en Google Play si no está instalada. */
export function openMercadoFlexApp(): Promise<FlexAppOpenOutcome> {
  return launchFlexApp({
    platform: Platform.OS,
    openApplication: (pkg) => IntentLauncher.openApplication(pkg),
    openUrl: async (url) => {
      try {
        await Linking.openURL(url);
        return true;
      } catch {
        return false;
      }
    },
  });
}
