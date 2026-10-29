/**
 * Estados de una parada de reparto. Espeja a `App\Domains\Routes\Enums\RouteStopStatus`
 * en el backend, incluida la definición de terminal: una parada cerrada no se
 * reabre, y el reintento de un envío fallido genera una parada nueva en otra ruta.
 */
export type RouteStopStatusCode =
  | 'pending'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'failed'
  | 'skipped';

const TERMINAL = new Set<string>(['completed', 'failed', 'skipped']);

const LABEL: Record<string, string> = {
  pending: 'Pendiente',
  en_route: 'En camino',
  arrived: 'En el domicilio',
  completed: 'Entregada',
  failed: 'Fallida',
  skipped: 'Omitida',
};

function normalize(status: string): string {
  return status.trim().toLowerCase();
}

/**
 * Una parada terminal ya tiene novedad: sale de la lista de trabajo del
 * repartidor y pasa al bloque de cerradas.
 */
export function isTerminalStopStatus(status: string): boolean {
  return TERMINAL.has(normalize(status));
}

export function routeStopStatusLabel(status: string): string {
  const s = normalize(status);
  return LABEL[s] ?? (s === '' ? 'Pendiente' : s.replace(/_/g, ' '));
}
