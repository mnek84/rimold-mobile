/**
 * Queued sync event names. Use these with `enqueueEvent` / `handleEvent`.
 * and backend `DomainEventType` constants.
 */
export const EventType = {
  COLLECTION_STARTED: 'COLLECTION_STARTED',
  COLLECTION_ITEM_ADDED: 'COLLECTION_ITEM_ADDED',
  COLLECTION_ITEM_REMOVED: 'COLLECTION_ITEM_REMOVED',
  COLLECTION_FINISHED: 'COLLECTION_FINISHED',

  SHIPMENT_SCANNED: 'SHIPMENT_SCANNED',
  SHIPMENT_IN_TRANSIT: 'SHIPMENT_IN_TRANSIT',
  SHIPMENT_NEAR_DESTINATION: 'SHIPMENT_NEAR_DESTINATION',
  SHIPMENT_DELIVERED: 'SHIPMENT_DELIVERED',
  SHIPMENT_FAILED: 'SHIPMENT_FAILED',

  /** Batched device coordinates; payload includes `trackAggregateId` and `points: { lat, lng, t }[]`. */
  GPS_LOCATION: 'GPS_LOCATION',
} as const;

export type KnownEventType = (typeof EventType)[keyof typeof EventType];
