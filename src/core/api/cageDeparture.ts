import axios from 'axios';

import { apiClient } from './client';

export type CageDepartureStatus = {
  authorized: boolean;
  authorized_at: string | null;
};

/**
 * Consulta el estado de autorización de salida por el supervisor para una
 * jaula. Complementa la subscripción Reverb (initial fetch + reintentos).
 */
export async function getCageDepartureStatus(
  cageId: string,
  cageSessionId?: string,
): Promise<CageDepartureStatus> {
  try {
    const { data } = await apiClient.get<{
      authorized?: unknown;
      authorized_at?: unknown;
    }>(`/driver/cages/${cageId}/departure`, {
      params: cageSessionId ? { cage_session_id: cageSessionId } : undefined,
    });

    return {
      authorized: data?.authorized === true,
      authorized_at:
        typeof data?.authorized_at === 'string' ? data.authorized_at : null,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return { authorized: false, authorized_at: null };
    }
    throw error;
  }
}
