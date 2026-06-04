import { isAxiosError } from 'axios';

import { apiClient } from '@core/api/client';

import type { AppRelease } from './types';

type AppReleaseResponse = {
  data: AppRelease;
};

export async function fetchAppRelease(): Promise<AppRelease | null> {
  try {
    const res = await apiClient.get<AppReleaseResponse>('/mobile/app-release', {
      validateStatus: (status) => status === 200 || status === 204,
    });

    if (res.status === 204 || res.data?.data == null) {
      return null;
    }

    return res.data.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 204) {
      return null;
    }
    throw error;
  }
}
