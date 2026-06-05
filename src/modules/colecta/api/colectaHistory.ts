import { apiClient } from '@core/api';

export type ColectaHistoryItem = {
  id: string;
  businessId: string | null;
  businessName: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  status: string;
  totalItems: number;
  finishedAt: string;
};

export type ColectaHistoryDay = {
  date: string;
  totalItems: number;
  totalCollections: number;
  collections: ColectaHistoryItem[];
};

type RawItem = {
  id?: unknown;
  businessId?: unknown;
  businessName?: unknown;
  warehouseId?: unknown;
  warehouseName?: unknown;
  status?: unknown;
  totalItems?: unknown;
  finishedAt?: unknown;
};

type RawDay = {
  date?: unknown;
  totalItems?: unknown;
  totalCollections?: unknown;
  collections?: unknown;
};

type RawResponse = {
  days?: unknown;
};

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function parseItem(value: unknown): ColectaHistoryItem | null {
  if (value === null || typeof value !== 'object') return null;
  const o = value as RawItem;
  const id = stringOrNull(o.id);
  const finishedAt = stringOrNull(o.finishedAt);
  if (id === null || finishedAt === null) return null;
  return {
    id,
    businessId: stringOrNull(o.businessId),
    businessName: stringOrNull(o.businessName),
    warehouseId: stringOrNull(o.warehouseId),
    warehouseName: stringOrNull(o.warehouseName),
    status: typeof o.status === 'string' ? o.status : 'finished',
    totalItems: toNonNegativeInt(o.totalItems),
    finishedAt,
  };
}

function parseDay(value: unknown): ColectaHistoryDay | null {
  if (value === null || typeof value !== 'object') return null;
  const o = value as RawDay;
  const date = stringOrNull(o.date);
  if (date === null) return null;
  const collections: ColectaHistoryItem[] = [];
  if (Array.isArray(o.collections)) {
    for (const c of o.collections) {
      const parsed = parseItem(c);
      if (parsed !== null) collections.push(parsed);
    }
  }
  return {
    date,
    totalItems: toNonNegativeInt(o.totalItems),
    totalCollections: toNonNegativeInt(o.totalCollections),
    collections,
  };
}

/**
 * GET /colecta/history — finished collections of the authenticated driver,
 * grouped by local day (most recent first).
 */
export async function fetchColectaHistory(params?: {
  limit?: number;
  signal?: AbortSignal;
}): Promise<ColectaHistoryDay[]> {
  const { data } = await apiClient.get<RawResponse>('/colecta/history', {
    params: params?.limit != null ? { limit: params.limit } : undefined,
    signal: params?.signal,
  });

  if (data === null || typeof data !== 'object' || !Array.isArray(data.days)) {
    return [];
  }

  const out: ColectaHistoryDay[] = [];
  for (const d of data.days) {
    const parsed = parseDay(d);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}
