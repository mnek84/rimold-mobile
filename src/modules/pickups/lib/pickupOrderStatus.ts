import type { PickupOrderStatus, PickupStopStatus } from '../types';

export const PICKUP_ORDER_STATUS_LABEL: Record<PickupOrderStatus, string> = {
  pending: 'Pendiente de aceptar',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  in_progress: 'En curso',
  returning_to_warehouse: 'Volviendo al depósito',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const PICKUP_STOP_STATUS_LABEL: Record<PickupStopStatus, string> = {
  pending: 'Pendiente',
  en_route: 'En camino',
  arrived: 'En el cliente',
  scanning: 'Escaneando',
  completed: 'Completada',
  skipped: 'Omitida',
};

export function isTerminalOrderStatus(s: PickupOrderStatus): boolean {
  return s === 'rejected' || s === 'completed' || s === 'cancelled';
}
