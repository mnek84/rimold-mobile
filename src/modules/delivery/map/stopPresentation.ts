import { Ionicons } from '@expo/vector-icons';

import type { RouteStopView, StopAddressTypeCode } from '@core/api/routes';
import type { AppTheme } from '@theme';

import { formatDriverShipmentStatusLabel } from '../deliveryStatus';
import { routeStopStatusLabel } from '../routeStopStatus';

export type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Cómo se dibuja una parada en el mapa. Cinco estados, no los veinte códigos
 * que viajan por la API: el chofer mirando el mapa en la calle contesta una
 * sola pregunta por chincheta —¿esta me falta, la estoy haciendo, o ya la
 * cerré?— y cualquier matiz extra se lee en la ficha, no en el pin.
 */
export type StopVisualKind = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

const DONE = new Set(['completed', 'delivered', 'returned']);
const FAILED = new Set(['failed', 'return_pending_intake', 'return_received', 'return_to_seller', 'return_in_transit']);
const SKIPPED = new Set(['skipped', 'cancelled']);
const ACTIVE = new Set(['en_route', 'arrived', 'out_for_delivery', 'in_transit', 'near_destination']);

function normalize(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase();
}

/**
 * El estado que manda es el del envío cuando existe.
 *
 * La parada la cierra la ruta y el envío lo cierra la entrega; entre un evento
 * y el otro está la cola offline. Si el chofer acaba de marcar "entregado" sin
 * señal, el envío ya lo refleja y la parada todavía dice `pending` — mostrar la
 * parada sería decirle que no hizo lo que acaba de hacer.
 */
export function stopEffectiveStatus(stop: RouteStopView): string {
  const shipment = normalize(stop.shipmentStatus);
  return shipment !== '' ? shipment : normalize(stop.status);
}

export function stopVisualKind(stop: RouteStopView): StopVisualKind {
  const s = stopEffectiveStatus(stop);
  if (DONE.has(s)) return 'done';
  if (FAILED.has(s)) return 'failed';
  if (SKIPPED.has(s)) return 'skipped';
  if (ACTIVE.has(s)) return 'active';
  return 'pending';
}

/** Una parada con novedad ya no es trabajo pendiente: cuenta como visitada. */
export function isVisitedKind(kind: StopVisualKind): boolean {
  return kind === 'done' || kind === 'failed' || kind === 'skipped';
}

export function stopStatusLabel(stop: RouteStopView): string {
  const shipment = normalize(stop.shipmentStatus);
  return shipment !== ''
    ? formatDriverShipmentStatusLabel(shipment)
    : routeStopStatusLabel(stop.status);
}

/**
 * Casa, comercio o tienda — el dato que le cambia la parada al chofer antes de
 * bajarse del auto. `unknown` dibuja un paquete: no se finge que es una casa.
 */
const ADDRESS_TYPE_ICON: Record<StopAddressTypeCode, IoniconName> = {
  residential: 'home',
  commercial: 'briefcase',
  store: 'storefront',
  unknown: 'cube',
};

const ADDRESS_TYPE_LABEL: Record<StopAddressTypeCode, string> = {
  residential: 'Domicilio',
  commercial: 'Comercio',
  store: 'Tienda',
  unknown: 'Sin clasificar',
};

export function addressTypeIcon(code: StopAddressTypeCode): IoniconName {
  return ADDRESS_TYPE_ICON[code] ?? ADDRESS_TYPE_ICON.unknown;
}

/** `null` para `unknown`: una etiqueta que dice que no sabemos nada ocupa lugar sin decir nada. */
export function addressTypeLabel(code: StopAddressTypeCode): string | null {
  return code === 'unknown' ? null : ADDRESS_TYPE_LABEL[code];
}

export type StopVisualStyle = {
  /** Relleno del círculo. */
  fill: string;
  /** Aro exterior — el halo blanco que despega la chincheta del mapa. */
  ring: string;
  /** Ícono dentro del círculo. */
  icon: IoniconName;
  iconColor: string;
};

/**
 * Cerrada se dibuja por desenlace (tilde / cruz), abierta por tipo de domicilio.
 *
 * Es la misma regla de Flex y no es decorativa: sobre una parada hecha ya no
 * hay nada que decidir, así que el pin informa el resultado; sobre una abierta
 * lo único accionable es qué clase de puerta vas a tocar.
 */
export function stopVisualStyle(
  t: AppTheme,
  kind: StopVisualKind,
  addressType: StopAddressTypeCode,
): StopVisualStyle {
  const { colors } = t;
  // Map tiles are light in both themes, so the ring is always the light marker ring
  // and each fill carries its own `*On` ink — never a hardcoded white.
  const ring = colors.mapMarkerRing;
  switch (kind) {
    case 'done':
      return { fill: colors.success, ring, icon: 'checkmark', iconColor: colors.successOn };
    case 'failed':
      return { fill: colors.danger, ring, icon: 'close', iconColor: colors.dangerOn };
    case 'skipped':
      return { fill: colors.muted, ring, icon: 'remove', iconColor: colors.surface };
    case 'active':
      return {
        fill: colors.primary,
        ring,
        icon: addressTypeIcon(addressType),
        iconColor: colors.primaryOn,
      };
    default:
      // Pendiente: fondo claro con el ícono en acento. Pesa menos en la vista
      // que una parada en curso, que es la única que el chofer está haciendo.
      return {
        fill: colors.surface,
        ring: colors.primary,
        icon: addressTypeIcon(addressType),
        iconColor: colors.primary,
      };
  }
}

/** Dirección en una línea, sin los separadores vacíos de un destino incompleto. */
export function formatStopAddress(stop: RouteStopView): string {
  const line = [stop.label, stop.addressLine2].filter((v): v is string => v !== null).join(' ');
  return line.trim() !== '' ? line.trim() : 'Sin dirección';
}

/** Localidad + CP, o `null` cuando el destino no trae ninguno de los dos. */
export function formatStopLocality(stop: RouteStopView): string | null {
  const locality = [stop.city, stop.state].filter((v): v is string => v !== null).join(', ');
  const parts = [locality, stop.postalCode !== null ? `CP ${stop.postalCode}` : null].filter(
    (v): v is string => v !== null && v !== '',
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function hasCoordinates(
  stop: RouteStopView,
): stop is RouteStopView & { latitude: number; longitude: number } {
  return (
    stop.latitude !== null &&
    stop.longitude !== null &&
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude) &&
    stop.latitude >= -90 &&
    stop.latitude <= 90 &&
    stop.longitude >= -180 &&
    stop.longitude <= 180
  );
}
