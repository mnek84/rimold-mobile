import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken } from './pushTokenApi';
import { setupNotificationChannels } from './setupNotificationChannels';

/**
 * Registro de push notifications con Expo:
 *  1. Pide permisos (Android tiene un canal por default en expo-notifications).
 *  2. Obtiene el ExpoPushToken via `getExpoPushTokenAsync` usando el projectId
 *     configurado en `app.json` → `extra.eas.projectId`.
 *  3. Persiste el token en el backend con `POST /push-tokens`.
 *
 * Best-effort: si el device es Expo Go, si el usuario niega permisos, o si
 * hay un error de red, la función no lanza — solo devuelve `null`. La app
 * sigue funcionando con polling como fallback.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    await setupNotificationChannels();

    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) {
      return null;
    }

    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoToken = tokenResult.data;
    if (!expoToken) return null;

    await registerPushToken({
      expo_token: expoToken,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    });

    return expoToken;
  } catch {
    // Silencioso: no queremos romper el login por push. Reintentos vendrán en
    // el próximo mount del listener.
    return null;
  }
}
