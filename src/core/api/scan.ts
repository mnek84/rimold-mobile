import axios from 'axios';

import { apiClient } from './client';

/**
 * Respuesta de `POST /v1/scan/resolve`.
 *
 * `tracking_id` se mantiene primero y sin cambios: builds anteriores sólo leen
 * esa clave. Los campos de bulto son aditivos y pueden venir ausentes contra un
 * backend que todavía no los expone.
 */
export type ResolveScanResponse = {
  tracking_id: string;
  shipment_id?: string | null;
  /** Identidad del bulto escaneado, ej. "KQX042-03". */
  package_code?: string | null;
  package_id?: string | null;
  /** Posición del bulto dentro del envío (1-based). */
  package_sequence?: number | null;
  /** Cantidad total de bultos del envío. */
  package_total?: number | null;
  /** True cuando el código identificó un envío multi-bulto pero no cuál bulto. */
  ambiguous?: boolean;
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
