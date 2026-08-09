import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { revokePushToken } from './pushTokenApi';

/**
 * Best-effort: obtiene el token push de este device y lo revoca en el backend.
 * Usado durante el logout para que el chofer saliente no reciba pushes de la
 * cuenta anterior. Silencioso: si falla (sin permisos, sin proyecto, offline),
 * no rompe el logout.
 */
export async function revokeCurrentDevicePushToken(): Promise<void> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.status !== 'granted') return;

    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoToken = tokenResult.data;
    if (!expoToken) return;

    await revokePushToken(expoToken);
  } catch {
    // Best-effort — el token quedará huérfano hasta que Expo devuelva
    // DeviceNotRegistered y el backend lo marque como revocado.
  }
}
