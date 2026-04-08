import { isValidLatLng, toFiniteNumber } from '@core/geo/coordinates';
import type { ColectaClient, ColectaWarehouse } from '@modules/colecta/types';

import { apiClient } from './client';

function parseWarehouseRow(value: unknown): ColectaWarehouse | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const o = value as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') {
    return null;
  }
  const lat = toFiniteNumber(o.latitude);
  const lng = toFiniteNumber(o.longitude);
  const hasCoords = lat !== null && lng !== null && isValidLatLng(lat, lng);
  const addr = o.address;
  return {
    id: o.id,
    name: o.name,
    address: typeof addr === 'string' ? addr : null,
    latitude: hasCoords ? lat : null,
    longitude: hasCoords ? lng : null,
  };
}

function parseClientRow(value: unknown): ColectaClient | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const o = value as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') {
    return null;
  }
  if (o.warehouses != null && !Array.isArray(o.warehouses)) {
    return null;
  }
  const warehouses: ColectaWarehouse[] = [];
  if (Array.isArray(o.warehouses)) {
    for (const w of o.warehouses) {
      const row = parseWarehouseRow(w);
      if (row !== null) {
        warehouses.push(row);
      }
    }
  }
  return { id: o.id, name: o.name, warehouses };
}

export type ClientsListPage = {
  data: ColectaClient[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/**
 * GET /clients — paginated; optional `search` is applied on the server (name).
 */
export async function fetchClientsPage(params: {
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<ClientsListPage> {
  const { data } = await apiClient.get<unknown>('/clients', {
    params: {
      ...(params.search != null && params.search.trim() !== ''
        ? { search: params.search.trim() }
        : {}),
      page: params.page ?? 1,
      per_page: params.per_page ?? 15,
    },
  });

  if (data === null || typeof data !== 'object') {
    return { data: [], current_page: 1, last_page: 1, per_page: 15, total: 0 };
  }

  const o = data as Record<string, unknown>;
  const rawList = o.data;
  const out: ColectaClient[] = [];
  if (Array.isArray(rawList)) {
    for (const item of rawList) {
      const row = parseClientRow(item);
      if (row !== null) {
        out.push(row);
      }
    }
  }

  return {
    data: out,
    current_page: parsePositiveInt(o.current_page, 1),
    last_page: Math.max(1, parsePositiveInt(o.last_page, 1)),
    per_page: parsePositiveInt(o.per_page, 15),
    total: typeof o.total === 'number' && o.total >= 0 ? o.total : out.length,
  };
}
