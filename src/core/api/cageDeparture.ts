import axios from 'axios';

import { apiClient } from './client';

export type CageDepartureStatus = {
  authorized: boolean;
  authorized_at: string | null;
  /**
   * `true` cuando quedan bultos asignados que nadie escaneo y ningun supervisor
   * lo autorizo. Mientras este en `true`, el transportista no sale.
   */
  blocked: boolean;
  assigned: number;
  scanned: number;
  missing: number;
  /** Los que faltan, por tracking: "29 de 30" no manda a nadie a buscar nada. */
  missing_shipments: Array<{ id: string; tracking: string }>;
  cage_kind: string | null;
  override: {
    authorized_at: string | null;
    authorized_by: string | null;
    reason_code: string | null;
    note: string | null;
  } | null;
};

function toInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Estado de salida de una jaula: la autorizacion del supervisor Y el conteo.
 *
 * Las dos claves originales —`authorized` y `authorized_at`— se mantienen
 * intactas porque hay builds desplegados que las leen. Todo lo demas degrada a
 * cero contra un backend viejo, asi que la pantalla sigue funcionando.
 */
export async function getCageDepartureStatus(
  cageId: string,
  cageSessionId?: string,
): Promise<CageDepartureStatus> {
  const empty: CageDepartureStatus = {
    authorized: false,
    authorized_at: null,
    blocked: false,
    assigned: 0,
    scanned: 0,
    missing: 0,
    missing_shipments: [],
    cage_kind: null,
    override: null,
  };

  try {
    const { data } = await apiClient.get<Record<string, unknown>>(
      `/driver/cages/${cageId}/departure`,
      { params: cageSessionId ? { cage_session_id: cageSessionId } : undefined },
    );

    const missing = Array.isArray(data?.missing_shipments)
      ? (data.missing_shipments as Array<Record<string, unknown>>)
          .filter((r) => typeof r?.id === 'string' && typeof r?.tracking === 'string')
          .map((r) => ({ id: String(r.id), tracking: String(r.tracking) }))
      : [];

    const override =
      data?.override != null && typeof data.override === 'object'
        ? (data.override as CageDepartureStatus['override'])
        : null;

    return {
      authorized: data?.authorized === true,
      authorized_at: typeof data?.authorized_at === 'string' ? data.authorized_at : null,
      blocked: data?.blocked === true,
      assigned: toInt(data?.assigned),
      scanned: toInt(data?.scanned),
      missing: toInt(data?.missing),
      missing_shipments: missing,
      cage_kind: typeof data?.cage_kind === 'string' ? data.cage_kind : null,
      override,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return empty;
    }
    throw error;
  }
}

/**
 * El supervisor deja salir una jaula incompleta, con motivo.
 *
 * El backend congela los contadores junto con la firma: sin eso, una auditoria
 * posterior no distingue al que dejo pasar un faltante de uno del que dejo pasar
 * treinta, porque los dos numeros siguen moviendose despues.
 */
export async function authorizeCageDeparture(input: {
  cageId: string;
  cageSessionId?: string | null;
  reasonCode: string;
  note?: string;
}): Promise<void> {
  await apiClient.post(`/admin/cages/${input.cageId}/authorize-departure`, {
    cage_session_id: input.cageSessionId ?? null,
    reason_code: input.reasonCode,
    note: input.note,
  });
}
