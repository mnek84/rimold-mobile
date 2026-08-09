import { apiClient } from '@core/api/client';

export type RegisterPushTokenInput = {
  expo_token: string;
  platform?: 'ios' | 'android' | 'web';
  device_name?: string;
};

/**
 * POST idempotente: si el token ya existe, el backend lo re-vincula al user
 * actual y limpia `revoked_at`.
 */
export async function registerPushToken(input: RegisterPushTokenInput): Promise<void> {
  await apiClient.post('/push-tokens', input);
}

/**
 * DELETE del token para el user autenticado. Best-effort: si falla, no romper
 * el logout — el token quedará huérfano en el backend hasta que Expo devuelva
 * `DeviceNotRegistered` en la próxima corrida y lo revoquemos server-side.
 */
export async function revokePushToken(expoToken: string): Promise<void> {
  await apiClient.delete('/push-tokens', { data: { expo_token: expoToken } });
}
