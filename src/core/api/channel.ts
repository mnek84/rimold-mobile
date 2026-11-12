/**
 * Clasificación de canal de un envío, resuelta en el backend
 * (`App\Domains\Shipments\Support\ShipmentChannelClassification`).
 *
 * La app NO la deriva: la lee. El único fallback es para un backend anterior a
 * este campo (sin `channel` en la respuesta): ahí se mira `execution_type`, que
 * es lo que la app usaba antes, para no cambiar el comportamiento de golpe.
 */
export type ShipmentOperator = 'internal' | 'mercadolibre_flex' | 'tiendanube';

export type ShipmentChannel = {
  operator: ShipmentOperator;
  operatorLabel: string;
  /** Por dónde entró el envío (`source_channel`). */
  origin: string;
  addressType: 'residential' | 'commercial' | 'store' | 'unknown';
  addressTypeLabel: string;
  /** `external_provider` = el estado lo informa el marketplace (Flex). */
  statusAuthority: 'internal' | 'external_provider';
  /** Si nuestro chofer puede mover el estado de entrega desde esta app. */
  driverActionsAllowed: boolean;
  /** "Propio", "Flex · Residencial", "Flex · Comercial", "Tiendanube"… */
  label: string;
  /**
   * Sólo Flex: `flex_batch` = pertenece a un lote (cierre de jaula);
   * `driver_only` = asignado al chofer por escaneo, sin lote. Ninguno es una
   * parada de ruta interna. `null` en propios o con un backend anterior.
   */
  flexAssignment: 'flex_batch' | 'driver_only' | null;
  /** "En lote Flex" / "Asignado sin lote". */
  flexAssignmentLabel: string | null;
};

const OPERATORS: ReadonlySet<string> = new Set(['internal', 'mercadolibre_flex', 'tiendanube']);
const ADDRESS_TYPES: ReadonlySet<string> = new Set(['residential', 'commercial', 'store', 'unknown']);

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() !== '' ? v : fallback;
}

/**
 * @param raw  El objeto `channel` del backend (puede faltar).
 * @param fallbackExecutionType  `execution_type` de la misma respuesta, para backends viejos.
 */
export function parseShipmentChannel(raw: unknown, fallbackExecutionType?: unknown): ShipmentChannel {
  if (raw !== null && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const operator = OPERATORS.has(str(o.operator)) ? (str(o.operator) as ShipmentOperator) : 'internal';
    const addressType = ADDRESS_TYPES.has(str(o.address_type))
      ? (str(o.address_type) as ShipmentChannel['addressType'])
      : 'unknown';
    const statusAuthority = o.status_authority === 'external_provider' ? 'external_provider' : 'internal';

    return {
      operator,
      operatorLabel: str(o.operator_label, operator === 'mercadolibre_flex' ? 'Flex' : 'Propio'),
      origin: str(o.origin, 'unknown'),
      addressType,
      addressTypeLabel: str(o.address_type_label, 'Sin clasificar'),
      statusAuthority,
      // Si el backend no lo dice, se deduce de la autoridad: nunca se habilita
      // una acción sobre algo cuyo estado decide otro.
      driverActionsAllowed:
        typeof o.driver_actions_allowed === 'boolean'
          ? o.driver_actions_allowed
          : statusAuthority === 'internal',
      label: str(o.label, operator === 'mercadolibre_flex' ? 'Flex' : 'Propio'),
      flexAssignment:
        o.flex_assignment === 'flex_batch' || o.flex_assignment === 'driver_only' ? o.flex_assignment : null,
      flexAssignmentLabel: str(o.flex_assignment_label) || null,
    };
  }

  const isFlex = typeof fallbackExecutionType === 'string' && fallbackExecutionType.trim().toLowerCase() === 'flex';

  return {
    operator: isFlex ? 'mercadolibre_flex' : 'internal',
    operatorLabel: isFlex ? 'Flex' : 'Propio',
    origin: 'unknown',
    addressType: 'unknown',
    addressTypeLabel: 'Sin clasificar',
    statusAuthority: isFlex ? 'external_provider' : 'internal',
    driverActionsAllowed: !isFlex,
    label: isFlex ? 'Flex' : 'Propio',
    flexAssignment: null,
    flexAssignmentLabel: null,
  };
}

export function isFlexChannel(channel: ShipmentChannel | null | undefined): boolean {
  return channel?.operator === 'mercadolibre_flex';
}
