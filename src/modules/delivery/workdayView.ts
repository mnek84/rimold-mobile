/**
 * Vista de la jornada en el listado de Entregas. Pura (sólo imports de tipos),
 * para probarla con `node --test` (ver `mobile/tests/workday-view.test.mjs`).
 *
 * Reemplaza el filtro "Todos / Propios / Flex": partía la lista por un eje que
 * el chofer no usa para decidir (el tipo ya se ve en cada tarjeta), y los
 * números no eran de la jornada sino de todo el año. El eje que sí decide es
 * "¿qué me falta?": Pendientes · Entregados · Incidencias.
 */
import type { RowWorkdayState, TodayShipmentRow } from '@core/api/shipments';
import type { DriverWorkday, FinishWorkdayResult } from '@core/api/workday';

export type WorkdayFilter = 'pending' | 'delivered' | 'incident';

type Row = Pick<TodayShipmentRow, 'status' | 'workday_state' | 'channel'>;

const FALLBACK_DELIVERED = new Set(['delivered']);
const FALLBACK_CANCELLED = new Set(['cancelled']);
const FALLBACK_INCIDENT = new Set([
  'failed',
  'return_pending_intake',
  'return_received',
  'return_to_seller',
  'return_in_transit',
  'returned',
]);

/**
 * Estado del envío en la jornada. Lo decide el backend (`workday_state`); el
 * cálculo local es SÓLO para un backend anterior a ese campo.
 */
export function rowState(row: Row): RowWorkdayState {
  if (row.workday_state !== null) return row.workday_state;
  const s = row.status.trim().toLowerCase();
  if (FALLBACK_DELIVERED.has(s)) return 'delivered';
  if (FALLBACK_CANCELLED.has(s)) return 'cancelled';
  if (FALLBACK_INCIDENT.has(s)) return 'incident';
  return 'pending';
}

export function isFlexRow(row: Pick<TodayShipmentRow, 'channel'>): boolean {
  return row.channel.operator === 'mercadolibre_flex';
}

/** Un cancelado no es trabajo pendiente ni una entrega: va con las incidencias. */
export function filterOf(state: RowWorkdayState): WorkdayFilter {
  return state === 'cancelled' ? 'incident' : state;
}

export type RowCounts = {
  total: number;
  pending: number;
  delivered: number;
  incident: number;
  own: number;
  flex: number;
  ownPending: number;
  flexPending: number;
};

export function countRows(rows: readonly Row[]): RowCounts {
  const c: RowCounts = { total: 0, pending: 0, delivered: 0, incident: 0, own: 0, flex: 0, ownPending: 0, flexPending: 0 };
  for (const r of rows) {
    const f = filterOf(rowState(r));
    const flex = isFlexRow(r);
    c.total++;
    c[f]++;
    if (flex) c.flex++;
    else c.own++;
    if (f === 'pending') {
      if (flex) c.flexPending++;
      else c.ownPending++;
    }
  }
  return c;
}

export function rowsForFilter<T extends Row>(rows: readonly T[], filter: WorkdayFilter): T[] {
  return rows.filter((r) => filterOf(rowState(r)) === filter);
}

export const FILTER_LABEL: Record<WorkdayFilter, string> = {
  pending: 'Pendientes',
  delivered: 'Entregados',
  incident: 'Incidencias',
};

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Línea de tipo de envío del resumen: cuántos de cada uno y quién los confirma. */
export function channelLines(c: RowCounts): string[] {
  const lines: string[] = [];
  if (c.own > 0) {
    lines.push(`${plural(c.own, 'propio', 'propios')} · se confirman en esta app`);
  }
  if (c.flex > 0) {
    lines.push(`${plural(c.flex, 'Flex', 'Flex')} · se confirman en Mercado Libre Flex`);
  }
  return lines;
}

/** Título del estado de la jornada para el resumen y la hoja de cierre. */
export function workdayStatusTitle(w: Pick<DriverWorkday, 'workday' | 'flex'>): string {
  switch (w.workday.status) {
    case 'no_work':
      return 'Sin envíos asignados hoy';
    case 'completed':
      return 'Jornada completa';
    case 'flex_pending':
      return w.flex.syncPending > 0 && w.flex.awaitingMl === 0
        ? 'Sincronizando envíos Flex con Mercado Libre'
        : `Faltan ${plural(w.flex.pending, 'envío Flex', 'envíos Flex')} en Mercado Libre Flex`;
    default:
      return 'Jornada en curso';
  }
}

/** Qué le pasó a la jornada después de tocar "Finalizar jornada". */
export function finishOutcomeMessage(r: FinishWorkdayResult): string {
  const flexPending = r.summary.flex.pending;
  const ownPart =
    r.ownResult === 'finished'
      ? 'Tu ruta propia quedó finalizada.'
      : r.ownResult === 'already_finished'
        ? 'Tu ruta propia ya estaba finalizada.'
        : r.summary.own.total > 0
          ? 'No tenías una ruta propia abierta.'
          : null;

  const flexPart =
    flexPending > 0
      ? `${plural(flexPending, 'envío Flex sigue', 'envíos Flex siguen')} pendiente${flexPending === 1 ? '' : 's'} en Mercado Libre. Confirmalos en Mercado Libre Flex: se cierran solos cuando Mercado Libre los informe.`
      : r.summary.flex.total > 0
        ? 'Todos tus envíos Flex ya fueron informados por Mercado Libre.'
        : null;

  const parts = [ownPart, flexPart].filter((p): p is string => p !== null);
  if (r.summary.workday.status === 'completed') {
    parts.unshift('Jornada completa.');
  }
  return parts.length > 0 ? parts.join(' ') : 'No había nada para finalizar.';
}

/** Rótulo de un Flex abierto en la hoja de cierre. */
export function flexOpenLabel(s: { syncState: 'awaiting_ml' | 'sync_pending'; externalStatus: string | null }): string {
  if (s.syncState === 'sync_pending') {
    return `Mercado Libre informó «${s.externalStatus ?? '—'}»: sincronizando`;
  }
  return s.externalStatus !== null
    ? `Sin confirmar en Mercado Libre Flex (estado ML: ${s.externalStatus})`
    : 'Sin confirmar en Mercado Libre Flex';
}
