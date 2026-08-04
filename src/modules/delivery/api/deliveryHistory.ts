import { apiClient } from '@core/api';

export type DeliveryHistoryItem = {
  id: string;
  trackingId: string;
  address: string;
  /** 'delivered' | 'returned' (backend restringe a estos dos). */
  status: string;
  /** ISO timestamp del cierre (delivered_at o fallback a last_event_at). */
  deliveredAt: string;
};

export type DeliveryHistoryDay = {
  /** Día local en formato YYYY-MM-DD. */
  date: string;
  totalDeliveries: number;
  shipments: DeliveryHistoryItem[];
};

export type DeliveryHistoryResponse = {
  /** Mes efectivo devuelto por el server (YYYY-MM). Puede diferir del pedido si estaba mal formateado. */
  month: string;
  days: DeliveryHistoryDay[];
};

type RawItem = {
  id?: unknown;
  trackingId?: unknown;
  address?: unknown;
  status?: unknown;
  deliveredAt?: unknown;
};

type RawDay = {
  date?: unknown;
  totalDeliveries?: unknown;
  shipments?: unknown;
};

type RawResponse = {
  month?: unknown;
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

function parseItem(value: unknown): DeliveryHistoryItem | null {
  if (value === null || typeof value !== 'object') return null;
  const o = value as RawItem;
  const id = stringOrNull(o.id);
  const deliveredAt = stringOrNull(o.deliveredAt);
  if (id === null || deliveredAt === null) return null;
  return {
    id,
    trackingId: stringOrNull(o.trackingId) ?? '',
    address: typeof o.address === 'string' ? o.address : '',
    status: typeof o.status === 'string' ? o.status : 'delivered',
    deliveredAt,
  };
}

function parseDay(value: unknown): DeliveryHistoryDay | null {
  if (value === null || typeof value !== 'object') return null;
  const o = value as RawDay;
  const date = stringOrNull(o.date);
  if (date === null) return null;
  const shipments: DeliveryHistoryItem[] = [];
  if (Array.isArray(o.shipments)) {
    for (const item of o.shipments) {
      const parsed = parseItem(item);
      if (parsed !== null) shipments.push(parsed);
    }
  }
  return {
    date,
    totalDeliveries: toNonNegativeInt(o.totalDeliveries),
    shipments,
  };
}

/**
 * GET /shipments/history — entregas cerradas (delivered + returned) del chofer
 * autenticado, agrupadas por día local (más reciente primero). Por defecto
 * devuelve el mes actual del server; pasar `month=YYYY-MM` para elegir otro.
 */
export async function fetchDeliveryHistory(params?: {
  month?: string;
  signal?: AbortSignal;
}): Promise<DeliveryHistoryResponse> {
  const query: Record<string, string> = {};
  if (params?.month != null && params.month !== '') {
    query.month = params.month;
  }

  const { data } = await apiClient.get<RawResponse>('/shipments/history', {
    params: Object.keys(query).length > 0 ? query : undefined,
    signal: params?.signal,
  });

  if (data === null || typeof data !== 'object') {
    return { month: params?.month ?? '', days: [] };
  }

  const days: DeliveryHistoryDay[] = [];
  if (Array.isArray(data.days)) {
    for (const d of data.days) {
      const parsed = parseDay(d);
      if (parsed !== null) days.push(parsed);
    }
  }

  const month = stringOrNull(data.month) ?? params?.month ?? '';

  return { month, days };
}
