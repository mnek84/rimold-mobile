import axios from 'axios';

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
