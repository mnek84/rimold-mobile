import { apiClient } from './client';

export type CageKind = 'zone' | 'special';

export type CageSpecialPurpose =
  | 'custody'
  | 'next_day_24h'
  | 'tomorrow_afternoon'
  | 'no_delivery'
  | 'other';

export const CAGE_SPECIAL_PURPOSE_LABELS: Record<CageSpecialPurpose, string> = {
  custody: 'Envíos en custodia',
  next_day_24h: 'Envíos en 24 hs',
  tomorrow_afternoon: 'Sale mañana',
  no_delivery: 'No sale a reparto',
  other: 'Especial',
};

export type WarehouseCageListItem = {
  id: string;
  name: string;
  shipments_count?: number;
  zone?: { id: string; name: string; code?: string | null } | null;
  active?: boolean;
  /** Necesario para asignar: dos depositos pueden tener una "JAULA 4". */
  crossdocking_location_id?: string | null;
  kind?: CageKind;
  special_purpose?: CageSpecialPurpose | null;
  /**
   * El par que decide si el transportista puede retirarse: `assigned_count` es
   * lo que ALGUIEN decidio que va a esta jaula, `scanned_count` lo que esta
   * fisicamente adentro.
   */
  assigned_count?: number;
  scanned_count?: number;
  missing_count?: number;
};

export type WarehouseCageShipment = {
  id: string;
  tracking: string;
  status_code?: string | null;
  business_id?: string | null;
  zone_id?: string | null;
  /** Asignado a esta jaula pero todavia no escaneado adentro. */
  pending_scan?: boolean;
};

export type WarehouseCageDetail = WarehouseCageListItem & {
  shipments?: WarehouseCageShipment[];
  /** Los que faltan escanear, con nombre: "29 de 30" no manda a nadie a buscar nada. */
  missing_shipments?: Array<{ id: string; tracking: string }>;
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

/**
 * Cierra la jaula. Si `driverId` esta definido, asigna ese conductor a todos los
 * envios liberados.
 *
 * El backend responde **409** cuando quedan bultos asignados sin escanear. El
 * override exige motivo y rol de supervisor: sin explicacion, el faltante queda
 * sin dueno y la proxima vez nadie sabe si fue error de carga, robo o jaula mal
 * armada.
 */
export async function closeWarehouseCage(
  cageId: string,
  driverId?: string | null,
  override?: { reason_code: string; note?: string },
): Promise<unknown[]> {
  const payload: Record<string, unknown> =
    driverId != null && driverId !== '' ? { driver_id: driverId } : {};

  if (override != null) {
    payload.override_reason_code = override.reason_code;
    if (override.note != null && override.note !== '') payload.override_note = override.note;
  }

  const { data } = await apiClient.post<unknown[]>(`/app/warehouse/cages/${cageId}/close`, payload);
  return Array.isArray(data) ? data : [];
}

export type CageAssignmentBatchResult = {
  assigned_count: number;
  failed_count: number;
  failed: Array<{ shipment_id: string; error_code: string; message: string }>;
};

/**
 * Asigna la jaula SIN escanear el bulto adentro.
 *
 * Es lo que permite decidir desde la app antes de tener el paquete en la mano.
 * No confundir con `scanPackageIntoCage`: eso registra presencia fisica, esto
 * registra una decision.
 */
export async function assignShipmentsToCage(input: {
  shipment_ids: string[];
  cage_id: string;
  crossdocking_location_id: string;
  force?: boolean;
  client_scan_id?: string;
}): Promise<CageAssignmentBatchResult> {
  const { data } = await apiClient.post<CageAssignmentBatchResult>(
    '/app/warehouse/crossdocking/assign-cage',
    input,
  );
  return data;
}

export async function unassignShipments(input: {
  shipment_ids: string[];
  crossdocking_location_id: string;
  reason_code: string;
  note?: string;
  force?: boolean;
}): Promise<CageAssignmentBatchResult> {
  const { data } = await apiClient.post<CageAssignmentBatchResult>(
    '/app/warehouse/crossdocking/unassign-cage',
    input,
  );
  return data;
}

export type ShipmentLookupResult = {
  found: boolean;
  assignment_mode?: 'auto' | 'manual';
  shipment?: { id: string; tracking: string; status_code: string };
  business?: { id: string; name: string } | null;
  destination?: { postal_code: string | null; city: string | null; state: string | null } | null;
  suggested_cage?: { id: string; name: string; position: number | null } | null;
  assigned_cage?: { id: string; name: string; position: number | null } | null;
  scanned_into_cage?: { id: string; name: string; placed_at: string | null } | null;
  preassigned_driver?: { id: string; name: string | null } | null;
  reason?: string;
};

/**
 * Ficha de SOLO LECTURA de un envio.
 *
 * NO usar `crossdocking/allocate` para esto: ese endpoint registra un escaneo y
 * mueve contadores, asi que "mirar" un bulto lo contaria como procesado y
 * romperia el par asignado/escaneado en silencio.
 */
export async function lookupShipmentForAssignment(input: {
  raw: string;
  crossdocking_location_id: string;
}): Promise<ShipmentLookupResult> {
  const { data } = await apiClient.get<ShipmentLookupResult>('/app/warehouse/shipments/lookup', {
    params: { raw: input.raw.trim(), crossdocking_location_id: input.crossdocking_location_id },
  });
  return data;
}

export async function fetchDriversForAssignment(): Promise<DriverForAssignment[]> {
  const { data } = await apiClient.get<{ data?: DriverForAssignment[] }>('/drivers/for-assignment');
  const rows = data?.data;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (d): d is DriverForAssignment => d != null && typeof d.id === 'string' && typeof d.name === 'string',
  );
}
