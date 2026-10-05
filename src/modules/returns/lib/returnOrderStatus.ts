import type { ReturnOrderStatus, ReturnStopStatus } from '../types';

export const RETURN_ORDER_STATUS_LABEL: Record<ReturnOrderStatus, string> = {
  unassigned: 'Sin asignar',
  pending: 'Pendiente de aceptar',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  in_progress: 'En curso',
  returning_to_warehouse: 'Volviendo al depósito',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const RETURN_STOP_STATUS_LABEL: Record<ReturnStopStatus, string> = {
  pending: 'Pendiente',
  en_route: 'En camino',
  arrived: 'En el seller',
  scanning: 'Escaneando',
  completed: 'Entregada',
  skipped: 'Omitida',
};

export function isTerminalOrderStatus(s: ReturnOrderStatus): boolean {
  return s === 'rejected' || s === 'completed' || s === 'cancelled';
}

/**
 * Acción que le toca al chofer en esta parada. Null cuando no hay nada que
 * hacer (parada cerrada o todavía no es su turno).
 */
export function nextStopAction(
  s: ReturnStopStatus,
): { label: string; action: 'arrive' | 'scan' | 'complete' } | null {
  switch (s) {
    case 'en_route':
      return { label: 'Llegué al seller', action: 'arrive' };
    case 'arrived':
      return { label: 'Empezar a entregar', action: 'scan' };
    case 'scanning':
      return { label: 'Confirmar entrega', action: 'complete' };
    default:
      return null;
  }
}
