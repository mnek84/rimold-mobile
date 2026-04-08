import { EventType } from '@core/sync';

import type { DriverActionKey } from './deliveryStatus';

export const DELIVERY_DETAIL_ACTIONS: {
  key: DriverActionKey;
  label: string;
  variant: 'primary' | 'secondary' | 'success' | 'danger';
}[] = [
  { key: 'en_camino', label: 'En camino', variant: 'primary' },
  { key: 'cerca', label: 'Cerca', variant: 'secondary' },
  { key: 'entregado', label: 'Entregado', variant: 'success' },
  { key: 'fallido', label: 'Fallido', variant: 'danger' },
];

export const DELIVERY_ACTION_EVENT_MAP: Record<
  DriverActionKey,
  { eventType: string; optimisticCode: string }
> = {
  en_camino: { eventType: EventType.SHIPMENT_IN_TRANSIT, optimisticCode: 'in_depot' },
  cerca: { eventType: EventType.SHIPMENT_NEAR_DESTINATION, optimisticCode: 'out_for_delivery' },
  entregado: { eventType: EventType.SHIPMENT_DELIVERED, optimisticCode: 'delivered' },
  fallido: { eventType: EventType.SHIPMENT_FAILED, optimisticCode: 'failed' },
};
