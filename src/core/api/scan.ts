import axios from 'axios';

import { apiClient } from './client';

export type ResolveScanResponse = {
  tracking_id: string;
};

export async function resolveExternalQR(
  raw: string,
  options?: { signal?: AbortSignal },
): Promise<ResolveScanResponse> {
  const { data } = await apiClient.post<ResolveScanResponse>(
    '/scan/resolve',
    { raw },
    { signal: options?.signal },
  );
  return data;
}

export function isResolveCancelled(error: unknown): boolean {
  if (axios.isCancel(error)) return true;
  return axios.isAxiosError(error) && error.code === 'ERR_CANCELED';
}
