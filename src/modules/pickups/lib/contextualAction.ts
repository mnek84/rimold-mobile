import type { PickupOrder, PickupStop } from '../types';

export type ContextualAction =
  | { kind: 'start-order' }
  | { kind: 'arrive-stop'; stop: PickupStop }
  | { kind: 'start-scanning'; stop: PickupStop }
  | { kind: 'complete-stop'; stop: PickupStop }
  | { kind: 'complete-order' }
  | { kind: 'none' };

/**
 * Devuelve la acción principal que el chofer puede realizar en este momento,
 * según el estado de la orden y del stop activo. Guía el ContextualActionButton.
 */
export function nextAction(order: PickupOrder): ContextualAction {
  if (order.status === 'accepted') {
    return { kind: 'start-order' };
  }
  if (order.status === 'in_progress') {
    const stop = order.stops.find(
      (s) => s.status === 'en_route' || s.status === 'arrived' || s.status === 'scanning',
    );
    if (!stop) return { kind: 'none' };
    if (stop.status === 'en_route') return { kind: 'arrive-stop', stop };
    if (stop.status === 'arrived') return { kind: 'start-scanning', stop };
    if (stop.status === 'scanning') return { kind: 'complete-stop', stop };
  }
  if (order.status === 'returning_to_warehouse') {
    return { kind: 'complete-order' };
  }
  return { kind: 'none' };
}

export function labelForAction(action: ContextualAction, order: PickupOrder): string {
  switch (action.kind) {
    case 'start-order':
      return 'Iniciar recorrido';
    case 'arrive-stop':
      return `Llegué a ${action.stop.warehouse?.name ?? 'la parada'}`;
    case 'start-scanning':
      return 'Empezar escaneo';
    case 'complete-stop':
      return 'Terminar parada';
    case 'complete-order':
      return `Llegué al depósito${order.crossdocking_location?.name ? ' ' + order.crossdocking_location.name : ''}`;
    case 'none':
      return '';
  }
}
