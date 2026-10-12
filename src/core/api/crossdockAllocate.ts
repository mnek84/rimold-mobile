import axios from 'axios';
import { randomUUID } from 'expo-crypto';

import { apiClient } from './client';

export type CrossdockingLocation = {
  id: string;
  name: string;
  code?: string | null;
  is_default: boolean;
  is_active: boolean;
};

export type CrossdockAllocateReason =
  | 'barcode_invalid'
  | 'shipment_not_found'
  | 'missing_destination'
  | 'no_cage_for_cp'
  | 'network'
  | 'unknown';

export type CrossdockAllocateResult = {
  success: boolean;
  grid: number;
  msg: string;
  error_code: CrossdockAllocateReason | null;
  /** Re-escaneo del mismo bulto. La jaula es la misma; no es un error. */
  duplicate: boolean;
  cage: {
    id: string;
    name: string;
    position: number | null;
    capacity: number | null;
    session_count: number | null;
  } | null;
  shipment: {
    id: string;
    tracking: string;
    status: string;
    destination_postal_code?: string | null;
  } | null;
  destination_label: string | null;
};

/**
 * Lista los depósitos de crossdocking activos disponibles para el operario.
 */
export async function listCrossdockingLocations(): Promise<CrossdockingLocation[]> {
  const { data } = await apiClient.get<CrossdockingLocation[]>(
    '/app/warehouse/crossdocking-locations',
  );
  return Array.isArray(data) ? data : [];
}

function normalizeReason(input: unknown): CrossdockAllocateReason | null {
  if (typeof input !== 'string' || input === '') return null;
  if (
    input === 'barcode_invalid' ||
    input === 'shipment_not_found' ||
    input === 'missing_destination' ||
    input === 'no_cage_for_cp'
  ) {
    return input;
  }
  return 'unknown';
}

/** Un id por INTENTO de escaneo. Se reusa en los reintentos del mismo intento. */
export function newClientScanId(): string {
  return randomUUID();
}

const RETRY_DELAYS_MS = [400, 1200];

function isRetryable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  // Sin respuesta = no llegó, o llegó y se perdió la vuelta. En los dos casos
  // reintentar es seguro: `client_scan_id` hace que el servidor no repita el
  // trabajo, sólo repita la respuesta.
  if (error.response === undefined) return true;
  const status = error.response.status;
  return status === 429 || status >= 500;
}

/**
 * Resuelve la jaula de un bulto desde la app del operario.
 *
 * Comparte el Action con el endpoint del sorter físico, así que devuelve la
 * misma jaula que asignaría la máquina. La app sortea igual con el sorter
 * apagado — es un camino de primera clase, no un modo degradado.
 *
 * IDEMPOTENCIA: `client_scan_id` viaja en el body, no como `Idempotency-Key`.
 * El middleware genérico de idempotencia del backend responde 204 sin cuerpo
 * cuando detecta un reintento, y acá eso sería lo peor posible: el operario se
 * quedaría sin número de jaula justo cuando falló la red. Con `client_scan_id`
 * el backend reenvía la respuesta COMPLETA del primer intento.
 */
export async function crossdockAllocate(input: {
  barcode: string;
  crossdocking_location_id: string;
  client_scan_id: string;
}): Promise<CrossdockAllocateResult> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { data } = await apiClient.post<Record<string, unknown>>(
        '/app/warehouse/crossdocking/allocate',
        {
          barcode: input.barcode,
          crossdocking_location_id: input.crossdocking_location_id,
          client_scan_id: input.client_scan_id,
        },
      );
      return normalizeResult(data);
    } catch (error) {
      lastError = error;

      // Un 4xx con cuerpo es una respuesta de negocio (CP sin jaula, envío
      // inexistente): reintentar no la cambia.
      if (axios.isAxiosError(error)) {
        const body = error.response?.data;
        if (body != null && typeof body === 'object' && 'success' in body) {
          return normalizeResult(body as Record<string, unknown>);
        }
      }

      if (!isRetryable(error) || attempt === RETRY_DELAYS_MS.length) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  if (axios.isAxiosError(lastError)) {
    const body = lastError.response?.data;
    if (body != null && typeof body === 'object') {
      return normalizeResult(body as Record<string, unknown>);
    }
  }

  return {
    success: false,
    grid: 0,
    msg: 'Sin conexión, reintentá.',
    error_code: 'network',
    duplicate: false,
    cage: null,
    shipment: null,
    destination_label: null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function normalizeResult(body: Record<string, unknown>): CrossdockAllocateResult {
  const cage = body.cage as Record<string, unknown> | null | undefined;
  const shipment = body.shipment as Record<string, unknown> | null | undefined;
  const scan = body.scan as Record<string, unknown> | null | undefined;
  const destination = scan?.destination as Record<string, unknown> | null | undefined;

  // El panel y la app muestran la localidad, no el CP: "Lanús" se entiende a la
  // primera, "1824" hay que traducirlo mentalmente.
  const destinationLabel =
    typeof destination?.locality === 'string' && destination.locality !== ''
      ? destination.locality
      : typeof destination?.city === 'string' && destination.city !== ''
        ? destination.city
        : typeof shipment?.destination_postal_code === 'string'
          ? shipment.destination_postal_code
          : null;

  return {
    success: body.success === true,
    grid: typeof body.grid === 'number' ? body.grid : 0,
    msg: typeof body.msg === 'string' ? body.msg : '',
    error_code: normalizeReason(body.error_code),
    duplicate: body.duplicate === true,
    cage:
      cage != null && typeof cage.id === 'string'
        ? {
            id: cage.id,
            name: typeof cage.name === 'string' ? cage.name : '',
            position: asNumberOrNull(cage.position),
            capacity: asNumberOrNull(cage.capacity),
            session_count: asNumberOrNull(cage.session_count),
          }
        : null,
    shipment:
      shipment != null && typeof shipment.id === 'string'
        ? {
            id: shipment.id,
            tracking: typeof shipment.tracking === 'string' ? shipment.tracking : '',
            status: typeof shipment.status === 'string' ? shipment.status : '',
            destination_postal_code:
              typeof shipment.destination_postal_code === 'string'
                ? shipment.destination_postal_code
                : null,
          }
        : null,
    destination_label: destinationLabel,
  };
}
