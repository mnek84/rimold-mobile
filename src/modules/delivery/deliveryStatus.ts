import type { TodayShipmentRow } from '@core/api/shipments';
import type { AppTheme } from '@theme';

export type DeliveryGroup = 'pendientes' | 'en_ruta' | 'entregados';

const ENTREGADOS = new Set(['delivered', 'returned']);
const EN_RUTA = new Set(['out_for_delivery', 'in_transit']);

/** Bucket for list grouping (Spanish UI labels). */
export function statusDeliveryGroup(status: string): DeliveryGroup {
  const s = status.trim().toLowerCase();
  if (ENTREGADOS.has(s)) {
    return 'entregados';
  }
  if (EN_RUTA.has(s)) {
    return 'en_ruta';
  }
  return 'pendientes';
}

const GROUP_ORDER: DeliveryGroup[] = ['pendientes', 'en_ruta', 'entregados'];

const GROUP_LABEL: Record<DeliveryGroup, string> = {
  pendientes: 'Pendientes',
  en_ruta: 'En ruta',
  entregados: 'Entregados',
};

/** Higher = closer to delivery attempt (for “next” pick within pendientes). */
const PENDING_PRIORITY: Record<string, number> = {
  assigned: 60,
  in_depot: 50,
  pending_route: 48,
  in_cage: 40,
  collected: 35,
  picked: 30,
  created: 20,
  missing_zone: 15,
  failed: 10,
  cancelled: 5,
};

function pendingPriority(status: string): number {
  return PENDING_PRIORITY[status.trim().toLowerCase()] ?? 0;
}

/**
 * Next shipment to act on: first “en ruta”, else highest-priority pendiente.
 */
export function pickNextShipmentId(rows: TodayShipmentRow[]): string | null {
  const enRuta = rows.filter((r) => statusDeliveryGroup(r.status) === 'en_ruta');
  if (enRuta.length > 0) {
    return enRuta[0].id;
  }
  const pend = rows.filter((r) => statusDeliveryGroup(r.status) === 'pendientes');
  if (pend.length === 0) {
    return null;
  }
  const sorted = [...pend].sort((a, b) => pendingPriority(b.status) - pendingPriority(a.status));
  return sorted[0].id;
}

export function groupShipmentsForSections(
  rows: TodayShipmentRow[],
): { title: string; data: TodayShipmentRow[] }[] {
  const buckets: Record<DeliveryGroup, TodayShipmentRow[]> = {
    pendientes: [],
    en_ruta: [],
    entregados: [],
  };
  for (const r of rows) {
    buckets[statusDeliveryGroup(r.status)].push(r);
  }
  return GROUP_ORDER.map((group) => ({
    title: GROUP_LABEL[group],
    data: buckets[group],
  })).filter((s) => s.data.length > 0);
}

export function formatShipmentStatusLabel(code: string): string {
  const t = code.trim();
  if (t === '') {
    return '—';
  }
  return t.replace(/_/g, ' ');
}

/** Spanish labels for driver list, headers, and search (alineado al flujo en camino / cerca). */
const DRIVER_STATUS_LABEL_ES: Record<string, string> = {
  missing_zone: 'Falta zona',
  created: 'Ingresado',
  picked: 'Retirado',
  collected: 'Recolectado',
  in_depot: 'Cerca',
  in_cage: 'En jaula',
  pending_route: 'Pendiente de ruta',
  assigned: 'Asignado',
  out_for_delivery: 'En camino',
  delivered: 'Entregado',
  failed: 'Falla',
  returned: 'Devuelto',
  cancelled: 'Cancelado',
  in_transit: 'En camino',
};

export function formatDriverShipmentStatusLabel(code: string): string {
  const s = code.trim().toLowerCase();
  if (s === '') {
    return '—';
  }
  return DRIVER_STATUS_LABEL_ES[s] ?? formatShipmentStatusLabel(code);
}

/**
 * Fase operativa API (0–3): asignación/bodega → in_depot → out_for_delivery → terminal.
 * La barra de lista sigue este orden cronológico; el timeline muestra los mismos hitos con títulos de conductor.
 */
export function shipmentDriverPhaseIndex(statusCode: string | null | undefined): number {
  const s = (statusCode ?? '').trim().toLowerCase();
  if (
    ['created', 'picked', 'in_cage', 'assigned', 'pending_route', 'missing_zone', 'collected'].includes(s)
  ) {
    return 0;
  }
  if (s === 'in_depot') {
    return 1;
  }
  if (s === 'out_for_delivery' || s === 'in_transit') {
    return 2;
  }
  if (['delivered', 'returned', 'failed', 'cancelled'].includes(s)) {
    return 3;
  }
  return 0;
}

function formatStatusLabelForSearch(status: string): string {
  const es = formatDriverShipmentStatusLabel(status).toLowerCase();
  const raw = status.replace(/_/g, ' ').toLowerCase();
  return `${es} ${raw}`;
}

export function matchesShipmentSearch(row: TodayShipmentRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') {
    return true;
  }
  const statusLabel = formatStatusLabelForSearch(row.status);
  return (
    row.tracking_id.toLowerCase().includes(q) ||
    row.address.toLowerCase().includes(q) ||
    statusLabel.includes(q)
  );
}

/** Visual bucket for list badges (maps API `status` to UI colors). */
export type ShipmentListBadgeKind = 'pending' | 'in_transit' | 'delivered' | 'failed';

export function shipmentListBadgeKind(status: string): ShipmentListBadgeKind {
  const s = status.trim().toLowerCase();
  if (s === 'delivered' || s === 'returned') {
    return 'delivered';
  }
  if (s === 'failed' || s === 'cancelled') {
    return 'failed';
  }
  if (s === 'out_for_delivery' || s === 'in_transit') {
    return 'in_transit';
  }
  return 'pending';
}

/** List + detail status pill colors (aligned with shipment list badges). */
export function shipmentListBadgeColors(
  t: AppTheme,
  kind: ShipmentListBadgeKind,
): { bg: string; border: string; text: string } {
  const { colors } = t;
  switch (kind) {
    case 'in_transit':
      return {
        bg: `${colors.primary}26`,
        border: `${colors.primary}66`,
        text: colors.primary,
      };
    case 'delivered':
      return {
        bg: `${colors.success}28`,
        border: `${colors.success}88`,
        text: colors.success,
      };
    case 'failed':
      return {
        bg: `${colors.danger}28`,
        border: `${colors.danger}88`,
        text: colors.danger,
      };
    default:
      return {
        bg: colors.surfaceMuted,
        border: colors.border,
        text: colors.muted,
      };
  }
}

export type DriverActionKey = 'en_camino' | 'cerca' | 'entregado' | 'fallido';

const TERMINAL = new Set(['delivered', 'returned', 'cancelled']);

export function isDriverActionEnabled(
  action: DriverActionKey,
  statusCode: string | null | undefined,
): boolean {
  const s = (statusCode ?? '').trim().toLowerCase();
  if (TERMINAL.has(s)) {
    return false;
  }
  if (s === 'failed') {
    return action === 'en_camino';
  }

  switch (action) {
    case 'en_camino':
      return ['assigned', 'created', 'picked', 'in_cage', 'pending_route', 'collected'].includes(s);
    case 'cerca':
      return s === 'in_depot';
    case 'entregado':
      return s === 'out_for_delivery' || s === 'in_transit';
    case 'fallido':
      return [
        'assigned',
        'created',
        'picked',
        'in_cage',
        'in_depot',
        'out_for_delivery',
        'in_transit',
        'pending_route',
        'collected',
        'missing_zone',
      ].includes(s);
    default:
      return false;
  }
}

export type TimelineStepUi = {
  key: string;
  title: string;
  state: 'done' | 'current' | 'upcoming' | 'error';
};

/**
 * Avance del envío (orden pantalla): Asignado → En camino → Cerca → Entregado / Falla.
 * API: fase 0 bodega/asignación, 1 in_depot (acción “cerca”), 2 out_for_delivery (camino al destino), 3 cierre.
 */
export function buildShipmentTimeline(statusCode: string | null | undefined): TimelineStepUi[] {
  const s = (statusCode ?? '').trim().toLowerCase();

  const lastTitle =
    s === 'delivered'
      ? 'Entregado'
      : s === 'returned'
        ? 'Devuelto'
        : s === 'failed'
          ? 'Falla'
          : s === 'cancelled'
            ? 'Cancelado'
            : 'Entregado';

  const apiPhase = shipmentDriverPhaseIndex(statusCode);

  const titles = ['Asignado a tu ruta', 'En camino', 'Cerca', lastTitle] as const;

  const stepState = (stepIdx: number): TimelineStepUi['state'] => {
    if (stepIdx === 3) {
      if (apiPhase < 3) {
        return 'upcoming';
      }
      if (s === 'failed' || s === 'cancelled') {
        return 'error';
      }
      return 'done';
    }
    if (stepIdx === 0) {
      return apiPhase === 0 ? 'current' : 'done';
    }
    if (stepIdx === 1) {
      if (apiPhase === 0) {
        return 'upcoming';
      }
      if (apiPhase === 1) {
        return 'done';
      }
      if (apiPhase === 2) {
        return 'current';
      }
      return 'done';
    }
    // step 2 — Cerca (in_depot)
    if (apiPhase <= 0) {
      return 'upcoming';
    }
    if (apiPhase === 1) {
      return 'current';
    }
    return 'done';
  };

  return titles.map((title, idx) => ({
    key: `tl${idx}`,
    title,
    state: stepState(idx),
  }));
}
