import axios, { isAxiosError } from 'axios';

import { useAuthStore } from '@store/useAuthStore';

/**
 * Default points at Laravel `routes/api.php` (prefix `api`) + `v1` group.
 * Override with EXPO_PUBLIC_API_URL (e.g. http://10.0.2.2:8000/api/v1).
 * Optional EXPO_PUBLIC_API_TOKEN for dev when not using in-app login.
 */
const envToken = process.env.EXPO_PUBLIC_API_TOKEN?.trim();

export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.0.5:8000/api/v1',
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const headers = config.headers;
  const already =
    (typeof headers.get === 'function' ? headers.get('Authorization') : undefined) ??
    (headers as { Authorization?: string }).Authorization;
  if (typeof already === 'string' && already !== '') {
    return config;
  }

  const sessionToken = useAuthStore.getState().token?.trim();
  const bearer = sessionToken !== '' && sessionToken != null ? sessionToken : envToken;
  if (bearer != null && bearer !== '') {
    if (typeof headers.set === 'function') {
      headers.set('Authorization', `Bearer ${bearer}`);
    } else {
      (headers as { Authorization: string }).Authorization = `Bearer ${bearer}`;
    }
  }
  return config;
});

/**
 * Mobile JWTs are issued without an `exp` claim, so they never expire on their own.
 * The session is only invalidated by:
 *  - the user logging out (handled in the UI), or
 *  - the server reporting the credentials are no longer valid:
 *    - any 401 (token blacklisted, revoked, signature invalid, user deleted, etc.)
 *    - 403 specifically on `/auth/me`, which is how the backend signals an inactive account.
 *
 * Transient failures (timeouts, 5xx, offline) are NOT treated as a logout signal: the
 * session is preserved so the app continues to work and retries succeed once the network
 * is back.
 */
function shouldClearSessionOnError(status: number | undefined, url: string | undefined): boolean {
  if (status === 401) return true;
  if (status === 403 && typeof url === 'string' && url.includes('/auth/me')) return true;
  return false;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const url = error.config?.url;
      if (shouldClearSessionOnError(status, url)) {
        const { isAuthenticated, clearSession } = useAuthStore.getState();
        if (isAuthenticated) {
          clearSession();
        }
      }
    }
    return Promise.reject(error);
  },
);
