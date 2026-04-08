import type { TodayShipmentRow } from '@core/api/shipments';
import type { AppTheme } from '@theme';

export type DeliveryGroup = 'pendientes' | 'en_ruta' | 'entregados';

const ENTREGADOS = new Set(['delivered', 'returned']);
const EN_RUTA = new Set(['out_for_delivery']);

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
  in_cage: 40,
  picked: 30,
  created: 20,
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

function formatStatusLabelForSearch(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase();
}

export function formatShipmentStatusLabel(code: string): string {
  const t = code.trim();
  if (t === '') {
    return '—';
  }
  return t.replace(/_/g, ' ');
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
        bg: 'rgba(148, 163, 184, 0.18)',
        border: 'rgba(148, 163, 184, 0.35)',
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
      return ['assigned', 'created', 'picked', 'in_cage'].includes(s);
    case 'cerca':
      return s === 'in_depot';
    case 'entregado':
      return s === 'out_for_delivery';
    case 'fallido':
      return ['assigned', 'created', 'picked', 'in_cage', 'in_depot', 'out_for_delivery'].includes(s);
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
 * Four-step driver timeline: preparación → depósito → destino → cierre.
 */
export function buildShipmentTimeline(statusCode: string | null | undefined): TimelineStepUi[] {
  const s = (statusCode ?? '').trim().toLowerCase();

  const lastTitle =
    s === 'delivered'
      ? 'Entregado'
      : s === 'returned'
        ? 'Devuelto'
        : s === 'failed'
          ? 'Fallido'
          : s === 'cancelled'
            ? 'Cancelado'
            : 'Cierre';

  const titles = ['Preparación', 'En depósito', 'Rumbo al destino', lastTitle] as const;

  let currentIdx = 0;
  if (['created', 'picked', 'in_cage', 'assigned'].includes(s)) {
    currentIdx = 0;
  } else if (s === 'in_depot') {
    currentIdx = 1;
  } else if (s === 'out_for_delivery') {
    currentIdx = 2;
  } else if (['delivered', 'returned', 'failed', 'cancelled'].includes(s)) {
    currentIdx = 3;
  }

  return titles.map((title, idx) => {
    let state: TimelineStepUi['state'];
    if (idx < currentIdx) {
      state = 'done';
    } else if (idx > currentIdx) {
      state = 'upcoming';
    } else if (s === 'failed' || s === 'cancelled') {
      state = 'error';
    } else if (s === 'delivered' || s === 'returned') {
      state = 'done';
    } else {
      state = 'current';
    }
    return { key: `tl${idx}`, title, state };
  });
}
