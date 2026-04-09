import { apiClient } from './client';

export type WarehouseCageListItem = {
  id: string;
  name: string;
  shipments_count?: number;
  zone?: { id: string; name: string; code?: string | null } | null;
  active?: boolean;
};

export type WarehouseCageShipment = {
  id: string;
  tracking: string;
  status_code?: string | null;
  business_id?: string | null;
  zone_id?: string | null;
};

export type WarehouseCageDetail = WarehouseCageListItem & {
  shipments?: WarehouseCageShipment[];
};

export type DriverForAssignment = {
  id: string;
  name: string;
  business_id?: string | null;
};

function parsePaginatedCages(payload: unknown): WarehouseCageListItem[] {
  if (payload === null || typeof payload !== 'object') return [];
  const o = payload as { data?: unknown };
  if (!Array.isArray(o.data)) return [];
  return o.data.filter((row): row is WarehouseCageListItem => {
    if (row === null || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    return typeof r.id === 'string' && typeof r.name === 'string';
  });
}

export async function fetchWarehouseCages(): Promise<WarehouseCageListItem[]> {
  const { data } = await apiClient.get<unknown>('/app/warehouse/cages', { params: { per_page: 200 } });
  return parsePaginatedCages(data);
}

export async function resolveWarehouseCageQr(raw: string): Promise<{ id: string; name: string }> {
  const { data } = await apiClient.post<{ id: string; name: string }>('/app/warehouse/cages/resolve-qr', {
    raw: raw.trim(),
  });
  if (data == null || typeof data.id !== 'string' || typeof data.name !== 'string') {
    throw new Error('Respuesta inválida al resolver la jaula.');
  }
  return data;
}

export async function fetchWarehouseCageDetail(id: string): Promise<WarehouseCageDetail> {
  const { data } = await apiClient.get<WarehouseCageDetail>(`/app/warehouse/cages/${id}`);
  return data;
}

export async function scanPackageIntoCage(cageId: string, tracking: string): Promise<unknown> {
  const { data } = await apiClient.post<unknown>('/app/warehouse/cages/scan', {
    cage_id: cageId,
    tracking: tracking.trim(),
  });
  return data;
}

/** Cierra la jaula. `driverId` solo se envía si viene definido (el backend hoy no lo usa; reservado). */
export async function closeWarehouseCage(cageId: string, driverId?: string | null): Promise<unknown[]> {
  const payload =
    driverId != null && driverId !== ''
      ? { driver_id: driverId }
      : {};
  const { data } = await apiClient.post<unknown[]>(`/app/warehouse/cages/${cageId}/close`, payload);
  return Array.isArray(data) ? data : [];
}

export async function fetchDriversForAssignment(): Promise<DriverForAssignment[]> {
  const { data } = await apiClient.get<{ data?: DriverForAssignment[] }>('/drivers/for-assignment');
  const rows = data?.data;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (d): d is DriverForAssignment => d != null && typeof d.id === 'string' && typeof d.name === 'string',
  );
}
