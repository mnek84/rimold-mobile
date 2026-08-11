import axios from 'axios';

import { apiClient } from './client';

export type CrossdockingLocation = {
  id: string;
  name: string;
  code?: string | null;
  is_default: boolean;
  is_active: boolean;
};

export type CrossdockAllocateReason =
  | 'barcode_invalid'
  | 'shipment_not_found'
  | 'missing_destination'
  | 'no_cage_for_cp'
  | 'network'
  | 'unknown';

export type CrossdockAllocateResult = {
  success: boolean;
  grid: number;
  msg: string;
  error_code: CrossdockAllocateReason | null;
  cage: { id: string; name: string; position: number | null } | null;
  shipment: {
    id: string;
    tracking: string;
    status: string;
    destination_postal_code?: string | null;
  } | null;
};

/**
 * Lista los depósitos de crossdocking activos disponibles para el operario.
 */
export async function listCrossdockingLocations(): Promise<CrossdockingLocation[]> {
  const { data } = await apiClient.get<CrossdockingLocation[]>(
    '/app/warehouse/crossdocking-locations',
  );
  return Array.isArray(data) ? data : [];
}

function normalizeReason(input: unknown): CrossdockAllocateReason | null {
  if (typeof input !== 'string' || input === '') return null;
  if (
    input === 'barcode_invalid' ||
    input === 'shipment_not_found' ||
    input === 'missing_destination' ||
    input === 'no_cage_for_cp'
  ) {
    return input;
  }
  return 'unknown';
}

/**
 * Fallback manual del sorter desde la app del operario. Comparte lógica con
 * el endpoint físico del sorter — devuelve el mismo grid (chute) que la
 * máquina asignaría.
 */
export async function crossdockAllocate(input: {
  barcode: string;
  crossdocking_location_id: string;
}): Promise<CrossdockAllocateResult> {
  try {
    const { data } = await apiClient.post<Record<string, unknown>>(
      '/app/warehouse/crossdocking/allocate',
      {
        barcode: input.barcode,
        crossdocking_location_id: input.crossdocking_location_id,
      },
    );
    return normalizeResult(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const body = error.response?.data;
      if (body && typeof body === 'object') {
        return normalizeResult(body as Record<string, unknown>);
      }
    }
    return {
      success: false,
      grid: 0,
      msg: 'Sin conexión, reintentá.',
      error_code: 'network',
      cage: null,
      shipment: null,
    };
  }
}

function normalizeResult(body: Record<string, unknown>): CrossdockAllocateResult {
  const cage = body.cage as Record<string, unknown> | null | undefined;
  const shipment = body.shipment as Record<string, unknown> | null | undefined;

  return {
    success: body.success === true,
    grid: typeof body.grid === 'number' ? body.grid : 0,
    msg: typeof body.msg === 'string' ? body.msg : '',
    error_code: normalizeReason(body.error_code),
    cage: cage && typeof cage.id === 'string'
      ? {
          id: cage.id,
          name: typeof cage.name === 'string' ? cage.name : '',
          position: typeof cage.position === 'number' ? cage.position : null,
        }
      : null,
    shipment: shipment && typeof shipment.id === 'string'
      ? {
          id: shipment.id,
          tracking: typeof shipment.tracking === 'string' ? shipment.tracking : '',
          status: typeof shipment.status === 'string' ? shipment.status : '',
          destination_postal_code:
            typeof shipment.destination_postal_code === 'string'
              ? shipment.destination_postal_code
              : null,
        }
      : null,
  };
}
