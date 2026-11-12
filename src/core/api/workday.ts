import { apiClient } from './client';

/**
 * Jornada unificada del chofer (`GET /driver/workday`, `POST /driver/workday/finish`).
 *
 * Los conteos y el estado los decide el backend (`DriverWorkdayQuery`): la app
 * los muestra, no los recalcula. Así el resumen, el listado y el cierre dicen
 * lo mismo que la base.
 */

export type WorkdayCounts = {
  total: number;
  pending: number;
  delivered: number;
  incident: number;
  cancelled: number;
};

export type WorkdayRoute = {
  id: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  stopsTotal: number;
  stopsOpen: number;
  isStarted: boolean;
  isFinished: boolean;
};

export type FlexOpenShipment = {
  shipmentId: string;
  tracking: string | null;
  statusCode: string | null;
  externalStatus: string | null;
  /** `awaiting_ml`: falta confirmarlo en Mercado Libre Flex. `sync_pending`: ML ya informó, falta reflejarlo. */
  syncState: 'awaiting_ml' | 'sync_pending';
};

export type WorkdayNotice = { code: string; message: string };

/** `no_work` · `in_progress` · `flex_pending` (lo propio cerrado, faltan Flex) · `completed`. */
export type WorkdayStatus = 'no_work' | 'in_progress' | 'flex_pending' | 'completed';

export type DriverWorkday = {
  serviceDate: string;
  totals: WorkdayCounts;
  own: WorkdayCounts & { state: string; route: WorkdayRoute | null };
  flex: WorkdayCounts & {
    state: string;
    awaitingMl: number;
    syncPending: number;
    openShipments: FlexOpenShipment[];
    batchCount: number;
  };
  workday: { status: WorkdayStatus; canFinishRoute: boolean; notices: WorkdayNotice[] };
};

export type FinishWorkdayResult = {
  ownResult: 'finished' | 'already_finished' | 'no_route';
  summary: DriverWorkday;
};

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function counts(raw: unknown): WorkdayCounts {
  const o = obj(raw);
  return {
    total: num(o.total),
    pending: num(o.pending),
    delivered: num(o.delivered),
    incident: num(o.incident),
    cancelled: num(o.cancelled),
  };
}

function route(raw: unknown): WorkdayRoute | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = obj(raw);
  const id = str(o.id);
  if (id === null) return null;
  return {
    id,
    status: str(o.status) ?? '',
    startedAt: str(o.started_at),
    finishedAt: str(o.finished_at),
    stopsTotal: num(o.stops_total),
    stopsOpen: num(o.stops_open),
    isStarted: o.is_started === true,
    isFinished: o.is_finished === true,
  };
}

const STATUSES: ReadonlySet<string> = new Set(['no_work', 'in_progress', 'flex_pending', 'completed']);

export function parseDriverWorkday(data: unknown): DriverWorkday {
  const o = obj(data);
  const own = obj(o.own);
  const flex = obj(o.flex);
  const wd = obj(o.workday);
  const status = str(wd.status) ?? 'in_progress';
  return {
    serviceDate: str(o.service_date) ?? '',
    totals: counts(o.totals),
    own: { ...counts(own), state: str(own.state) ?? 'none', route: route(own.route) },
    flex: {
      ...counts(flex),
      state: str(flex.state) ?? 'none',
      awaitingMl: num(flex.awaiting_ml),
      syncPending: num(flex.sync_pending),
      openShipments: (Array.isArray(flex.open_shipments) ? flex.open_shipments : [])
        .map((r): FlexOpenShipment | null => {
          const s = obj(r);
          const id = str(s.shipment_id);
          if (id === null) return null;
          return {
            shipmentId: id,
            tracking: str(s.tracking),
            statusCode: str(s.status_code),
            externalStatus: str(s.external_status),
            syncState: s.sync_state === 'sync_pending' ? 'sync_pending' : 'awaiting_ml',
          };
        })
        .filter((r): r is FlexOpenShipment => r !== null),
      batchCount: Array.isArray(flex.batches) ? flex.batches.length : 0,
    },
    workday: {
      status: (STATUSES.has(status) ? status : 'in_progress') as WorkdayStatus,
      canFinishRoute: wd.can_finish_route === true,
      notices: (Array.isArray(wd.notices) ? wd.notices : [])
        .map((n) => {
          const x = obj(n);
          const message = str(x.message);
          return message === null ? null : { code: str(x.code) ?? '', message };
        })
        .filter((n): n is WorkdayNotice => n !== null),
    },
  };
}

export async function fetchDriverWorkday(): Promise<DriverWorkday> {
  const { data } = await apiClient.get<unknown>('/driver/workday');
  return parseDriverWorkday(data);
}

/**
 * Finaliza la jornada. Con paradas propias abiertas y sin `force`, el servidor
 * responde 422 con `errors.pending_stops` y el resumen (ver `pendingStopsFromError`).
 * Idempotente: repetirlo devuelve `already_finished`.
 */
export async function finishDriverWorkday(opts?: { force?: boolean }): Promise<FinishWorkdayResult> {
  const { data } = await apiClient.post<unknown>('/driver/workday/finish', opts?.force === true ? { force: true } : {});
  const o = obj(data);
  const own = str(o.own_result);
  return {
    ownResult: own === 'finished' || own === 'already_finished' ? own : 'no_route',
    summary: parseDriverWorkday(o.summary),
  };
}
