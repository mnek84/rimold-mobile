import type { ReturnOrderStatus, ReturnStop, ReturnStopStatus } from '../types';

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

/**
 * `rejected` dejó de ser terminal: la orden vuelve al pool con su carga y el
 * supervisor le asigna otro transporte. Para el chofer que la rechazó igual
 * termina ahí —ya no es suya—, así que la lista la sigue tratando como cerrada.
 */
export function isTerminalOrderStatus(s: ReturnOrderStatus): boolean {
  return s === 'rejected' || s === 'completed' || s === 'cancelled';
}

/**
 * Acción que le toca al chofer en esta parada. Null cuando no hay nada que
 * hacer (parada cerrada o todavía no es su turno).
 */
export type StopAction = 'arrive' | 'scan' | 'conforme' | 'complete';

export function nextStopAction(
  stop: Pick<ReturnStop, 'status' | 'conforme_path'>,
): { label: string; action: StopAction } | null {
  switch (stop.status) {
    case 'en_route':
      return { label: 'Llegué al seller', action: 'arrive' };
    case 'arrived':
      return { label: 'Empezar a entregar', action: 'scan' };
    case 'scanning':
      // El conforme va antes del cierre: es lo que el backend exige para pasar
      // los bultos a "devuelto".
      return stop.conforme_path
        ? { label: 'Confirmar entrega', action: 'complete' }
        : { label: 'Adjuntar conforme', action: 'conforme' };
    default:
      return null;
  }
}
