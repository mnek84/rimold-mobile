import { parseShipmentChannel, type ShipmentChannel } from './channel';
import { apiClient } from './client';

/**
 * Clase de domicilio del destino. Espeja `App\Domains\Shipments\Enums\DestinationAddressType`.
 *
 * Nunca es `null`: un backend anterior a la columna `address_type_code` —o una
 * fila histórica sin clasificar— cae en `'unknown'`, que es una respuesta, no
 * una ausencia. El mapa lo usa para elegir el ícono de la parada, y "no
 * sabemos" tiene que dibujarse distinto de "es una casa".
 */
export type StopAddressTypeCode = 'residential' | 'commercial' | 'store' | 'unknown';

const ADDRESS_TYPE_CODES: ReadonlySet<string> = new Set([
  'residential',
  'commercial',
  'store',
  'unknown',
]);

export type RouteStopView = {
  id: string;
  sequence: number;
  status: string;
  shipmentId: string | null;
  /** Tracking del envío: la etiqueta que el chofer lee sobre el paquete. */
  tracking: string | null;
  /**
   * `status_code` del envío.
   *
   * No es lo mismo que `status` (el de la parada): la parada la cierra la ruta,
   * el envío lo cierra la entrega, y entre un evento y el otro hay una cola de
   * sincronización offline. En el mapa manda el estado del envío cuando existe,
   * porque es el que el chofer acaba de tocar.
   */
  shipmentStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  addressLine2: string | null;
  reference: string | null;
  addressTypeCode: StopAddressTypeCode;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /**
   * Campos de la vista unificada (`GET /driver/stops`). Opcionales: una parada
   * que viene de `/driver/routes` (sólo internos) no los tiene.
   */
  /** Envíos en este punto de entrega (propios + Flex). */
  shipmentCount?: number;
  /** De esos, cuántos siguen abiertos. */
  openCount?: number;
  /** Hay al menos un Flex en este punto (marca aparte en el pin). */
  hasFlex?: boolean;
  /** Canal del envío principal; en grupos mixtos ver `groupShipments`. */
  channel?: ShipmentChannel;
  groupShipments?: GroupShipmentView[];
  /** Sin ubicación válida: motivo (`missing`, `invalid`, `out_of_service_area`, `suspected_swap`). */
  unlocatableReason?: string | null;
  unlocatableLabel?: string | null;
  /** Misma dirección con coordenadas a más de 30 m entre sí: alguna está mal. */
  locationConflict?: boolean;
};

export type GroupShipmentView = {
  shipmentId: string;
  tracking: string | null;
  statusCode: string | null;
  isFinal: boolean;
  channel: ShipmentChannel;
  /** Estado de la parada interna (null para Flex: no tiene parada propia). */
  stopStatus: string | null;
  /** Último estado que informó Mercado Libre (sólo Flex). */
  externalStatus: string | null;
  addressLine2: string | null;
};

export type DriverDayTotals = {
  eligible: number;
  mapped: number;
  unlocatable: number;
  groups: number;
  byOperator: Record<string, number>;
  truncated: boolean;
};

export type DriverStopsView = {
  serviceDate: string;
  totals: DriverDayTotals;
  /** Grupos (con coordenadas) + no ubicables (sin coordenadas), en orden de recorrido. */
  stops: RouteStopView[];
};

export type DispatchOutcomeRow = {
  shipmentId: string;
  tracking: string | null;
  outcome: string;
  included: boolean;
  reasonCode: string | null;
  reasonLabel: string | null;
  channelLabel: string | null;
};

export type DispatchDayResult = {
  runId: string;
  replayed: boolean;
  routeId: string | null;
  included: DispatchOutcomeRow[];
  excluded: DispatchOutcomeRow[];
  flexBatchesMarked: number;
};

export type DriverRouteView = {
  id: string;
  driverId: string;
  status: string;
  date: string;
  startedAt: string | null;
  finishedAt: string | null;
  stops: RouteStopView[];
};

export type OptimizeRouteResponse = {
  polyline: string;
  duration: number;
  distance: number;
};

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toTrimmedStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function toAddressTypeCode(v: unknown): StopAddressTypeCode {
  if (typeof v !== 'string') {
    return 'unknown';
  }
  const normalized = v.trim().toLowerCase();
  return ADDRESS_TYPE_CODES.has(normalized) ? (normalized as StopAddressTypeCode) : 'unknown';
}

function normalizeRouteStop(raw: unknown): RouteStopView | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') {
    return null;
  }
  const seq = toFiniteNumber(o.sequence);
  if (seq === null || !Number.isInteger(seq)) {
    return null;
  }
  const shipmentId = typeof o.shipment_id === 'string' ? o.shipment_id : null;
  const status = typeof o.status === 'string' ? o.status : '';
  let lat: number | null = null;
  let lng: number | null = null;
  let label: string | null = null;
  let addressLine2: string | null = null;
  let reference: string | null = null;
  let addressTypeCode: StopAddressTypeCode = 'unknown';
  let city: string | null = null;
  let state: string | null = null;
  let postalCode: string | null = null;
  let tracking: string | null = null;
  let shipmentStatus: string | null = null;
  const shipment = o.shipment;
  if (shipment !== null && typeof shipment === 'object') {
    const sh = shipment as Record<string, unknown>;
    tracking = toTrimmedStringOrNull(sh.tracking);
    shipmentStatus = toTrimmedStringOrNull(sh.status_code);
    const dest = sh.destination;
    if (dest !== null && typeof dest === 'object') {
      const d = dest as Record<string, unknown>;
      lat = toFiniteNumber(d.latitude);
      lng = toFiniteNumber(d.longitude);
      label = toTrimmedStringOrNull(d.address_line1);
      addressLine2 = toTrimmedStringOrNull(d.address_line2);
      reference = toTrimmedStringOrNull(d.reference);
      addressTypeCode = toAddressTypeCode(d.address_type_code);
      city = toTrimmedStringOrNull(d.city);
      state = toTrimmedStringOrNull(d.state);
      postalCode = toTrimmedStringOrNull(d.postal_code);
    }
  }
  return {
    id: o.id,
    sequence: seq,
    status,
    shipmentId,
    tracking,
    shipmentStatus,
    latitude: lat,
    longitude: lng,
    label,
    addressLine2,
    reference,
    addressTypeCode,
    city,
    state,
    postalCode,
  };
}

function parseDriverRoute(data: unknown): DriverRouteView {
  if (data === null || typeof data !== 'object') {
    throw new Error('Invalid route response');
  }
  const o = data as Record<string, unknown>;
  if (typeof o.id !== 'string') {
    throw new Error('Invalid route response');
  }
  const driverId = typeof o.driver_id === 'string' ? o.driver_id : '';
  const status = typeof o.status === 'string' ? o.status : '';
  const dateRaw = o.date;
  const date = typeof dateRaw === 'string' ? dateRaw : '';
  const startedAt = typeof o.started_at === 'string' && o.started_at.trim() !== '' ? o.started_at : null;
  const finishedAt = typeof o.finished_at === 'string' && o.finished_at.trim() !== '' ? o.finished_at : null;
  const stopsIn = Array.isArray(o.stops) ? o.stops : [];
  const stops = stopsIn.map(normalizeRouteStop).filter((s): s is RouteStopView => s !== null);
  stops.sort((a, b) => a.sequence - b.sequence);

  return {
    id: o.id,
    driverId,
    status,
    date,
    startedAt,
    finishedAt,
    stops,
  };
}

export async function fetchDriverRoute(routeId: string): Promise<DriverRouteView> {
  const { data } = await apiClient.get<unknown>(`/routes/${routeId.trim()}`);
  return parseDriverRoute(data);
}

/**
 * Driver self-service: ask the backend to (idempotently) build today's active
 * internal route from every shipment currently assigned to the driver.
 */
export async function createDriverRoute(): Promise<DriverRouteView> {
  const { data } = await apiClient.post<unknown>('/driver/routes');
  return parseDriverRoute(data);
}

export async function optimizeRoute(routeId: string): Promise<OptimizeRouteResponse> {
  const { data } = await apiClient.post<OptimizeRouteResponse>(`/routes/${routeId.trim()}/optimize`);
  return data;
}

/**
 * Marks the route as started server-side. Idempotent: calling twice keeps the
 * original started_at.
 */
export async function startDriverRoute(routeId: string): Promise<DriverRouteView> {
  const { data } = await apiClient.post<unknown>(`/driver/routes/${routeId.trim()}/start`);
  return parseDriverRoute(data);
}

/**
 * Marks the route as finished. Server returns 422 with `pending_stops` when
 * there are pending route_stops and `force` is not set.
 */
export async function finishDriverRoute(
  routeId: string,
  opts?: { force?: boolean },
): Promise<DriverRouteView> {
  const body = opts?.force === true ? { force: true } : {};
  const { data } = await apiClient.post<unknown>(`/driver/routes/${routeId.trim()}/finish`, body);
  return parseDriverRoute(data);
}

// ---------------------------------------------------------------------------
// Jornada unificada: GET /driver/stops (propios + Flex agrupados por punto)
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function parseGroupShipment(raw: unknown): GroupShipmentView | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.shipment_id);
  if (id === null) return null;
  const stop = o.stop !== null && typeof o.stop === 'object' ? (o.stop as Record<string, unknown>) : null;
  const ext =
    o.external_status !== null && typeof o.external_status === 'object'
      ? (o.external_status as Record<string, unknown>)
      : null;
  const address =
    o.address !== null && typeof o.address === 'object' ? (o.address as Record<string, unknown>) : null;
  return {
    shipmentId: id,
    tracking: str(o.tracking),
    statusCode: str(o.status_code),
    isFinal: o.is_final === true,
    channel: parseShipmentChannel(o.channel),
    stopStatus: stop !== null ? str(stop.status) : null,
    externalStatus: ext !== null ? str(ext.external_status) : null,
    addressLine2: address !== null ? str(address.line2) : null,
  };
}

function addressOf(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function primaryOf(shipments: GroupShipmentView[]): GroupShipmentView | null {
  return shipments.find((s) => !s.isFinal) ?? shipments[0] ?? null;
}

/**
 * Convierte la vista del backend al modelo de parada que ya dibuja el mapa.
 * Un grupo = una parada; un envío no ubicable = una parada SIN coordenadas
 * (aparece en la lista con su motivo, nunca desaparece).
 */
export function parseDriverStops(data: unknown): DriverStopsView {
  const o = addressOf(data);
  const t = addressOf(o.totals);
  const byOperatorRaw = addressOf(t.by_operator);
  const byOperator: Record<string, number> = {};
  for (const [k, v] of Object.entries(byOperatorRaw)) {
    const n = toFiniteNumber(v);
    if (n !== null) byOperator[k] = n;
  }

  const stops: RouteStopView[] = [];
  const groups = Array.isArray(o.groups) ? o.groups : [];
  groups.forEach((rawGroup, index) => {
    const g = addressOf(rawGroup);
    const key = str(g.key);
    const lat = toFiniteNumber(g.latitude);
    const lng = toFiniteNumber(g.longitude);
    if (key === null) return;
    const members = (Array.isArray(g.shipments) ? g.shipments : [])
      .map(parseGroupShipment)
      .filter((s): s is GroupShipmentView => s !== null);
    const primary = primaryOf(members);
    const addr = addressOf(g.address);
    const seq = toFiniteNumber(g.sequence);
    const count = members.length;
    stops.push({
      id: `group:${key}`,
      sequence: seq !== null ? seq : 10_000 + index,
      status: primary?.stopStatus ?? (primary?.isFinal ? 'completed' : 'pending'),
      shipmentId: primary?.shipmentId ?? null,
      tracking: count > 1 ? `${count} envíos` : (primary?.tracking ?? null),
      shipmentStatus: primary?.statusCode ?? null,
      latitude: lat,
      longitude: lng,
      label: str(addr.line1),
      addressLine2: count === 1 ? (primary?.addressLine2 ?? null) : null,
      reference: str(addr.reference),
      addressTypeCode: toAddressTypeCode(g.address_type),
      city: str(addr.city),
      state: null,
      postalCode: str(addr.postal_code),
      shipmentCount: count,
      openCount: toFiniteNumber(g.open_count) ?? members.filter((m) => !m.isFinal).length,
      hasFlex: members.some((m) => m.channel.operator === 'mercadolibre_flex'),
      channel: primary?.channel,
      groupShipments: members,
      unlocatableReason: null,
      unlocatableLabel: null,
      locationConflict: g.location_conflict === true,
    });
  });

  const unlocatable = Array.isArray(o.unlocatable) ? o.unlocatable : [];
  unlocatable.forEach((raw, index) => {
    const member = parseGroupShipment(raw);
    if (member === null) return;
    const u = addressOf(raw);
    const addr = addressOf(u.address);
    stops.push({
      id: `unlocatable:${member.shipmentId}`,
      sequence: 20_000 + index,
      status: member.stopStatus ?? (member.isFinal ? 'completed' : 'pending'),
      shipmentId: member.shipmentId,
      tracking: member.tracking,
      shipmentStatus: member.statusCode,
      latitude: null,
      longitude: null,
      label: str(addr.line1),
      addressLine2: str(addr.line2),
      reference: str(addr.reference),
      addressTypeCode: toAddressTypeCode(member.channel.addressType),
      city: str(addr.city),
      state: null,
      postalCode: str(addr.postal_code),
      shipmentCount: 1,
      openCount: member.isFinal ? 0 : 1,
      hasFlex: member.channel.operator === 'mercadolibre_flex',
      channel: member.channel,
      groupShipments: [member],
      unlocatableReason: str(u.reason),
      unlocatableLabel: str(u.reason_label),
      locationConflict: false,
    });
  });

  stops.sort((a, b) => a.sequence - b.sequence);

  return {
    serviceDate: str(o.service_date) ?? '',
    totals: {
      eligible: toFiniteNumber(t.eligible) ?? 0,
      mapped: toFiniteNumber(t.mapped) ?? 0,
      unlocatable: toFiniteNumber(t.unlocatable) ?? 0,
      groups: toFiniteNumber(t.groups) ?? 0,
      byOperator,
      truncated: t.truncated === true,
    },
    stops,
  };
}

export async function fetchDriverStops(): Promise<DriverStopsView> {
  const { data } = await apiClient.get<unknown>('/driver/stops');
  return parseDriverStops(data);
}

function parseOutcomeRow(raw: unknown): DispatchOutcomeRow | null {
  const o = addressOf(raw);
  const id = str(o.shipment_id);
  if (id === null) return null;
  const channel = addressOf(o.channel);
  return {
    shipmentId: id,
    tracking: str(o.tracking),
    outcome: str(o.outcome) ?? '',
    included: o.included === true,
    reasonCode: str(o.reason_code),
    reasonLabel: str(o.reason_label),
    channelLabel: str(channel.label),
  };
}

/**
 * "Poner todos en camino". `idempotencyKey` tiene que ser el MISMO en los
 * reintentos de un mismo toque (red cortada, timeout): así el servidor devuelve
 * el resumen guardado en vez de procesar dos veces. Un 409 significa que el
 * primer intento sigue corriendo: reintentar en unos segundos con la misma key.
 */
export async function dispatchDriverDay(idempotencyKey: string): Promise<DispatchDayResult> {
  const { data } = await apiClient.post<unknown>('/driver/dispatch', {}, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  const o = addressOf(data);
  const counts = addressOf(o.counts);
  return {
    runId: str(o.run_id) ?? '',
    replayed: o.replayed === true,
    routeId: str(o.route_id),
    included: (Array.isArray(o.included) ? o.included : [])
      .map(parseOutcomeRow)
      .filter((r): r is DispatchOutcomeRow => r !== null),
    excluded: (Array.isArray(o.excluded) ? o.excluded : [])
      .map(parseOutcomeRow)
      .filter((r): r is DispatchOutcomeRow => r !== null),
    flexBatchesMarked: toFiniteNumber(counts.flex_batches_marked) ?? 0,
  };
}
