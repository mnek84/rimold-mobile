export type PickupOrderStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'returning_to_warehouse'
  | 'completed'
  | 'cancelled';

export type PickupStopStatus =
  | 'pending'
  | 'en_route'
  | 'arrived'
  | 'scanning'
  | 'completed'
  | 'skipped';

export type PickupStopWarehouse = {
  id: string;
  name: string;
  address: string | null;
  business_id: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type PickupStop = {
  id: string;
  pickup_order_id: string;
  warehouse_id: string;
  sequence: number;
  status: PickupStopStatus;
  collection_id: string | null;
  skip_reason: string | null;
  arrived_lat: number | null;
  arrived_lng: number | null;
  en_route_at: string | null;
  arrived_at: string | null;
  scanning_started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  warehouse: PickupStopWarehouse | null;
};

export type IncidentPhase = 'in_transit' | 'at_client' | 'returning' | 'other';

export type IncidentKind =
  | 'delay'
  | 'vehicle_issue'
  | 'client_absent'
  | 'cannot_pickup'
  | 'other';

export type IncidentResolution =
  | 'resolved'
  | 'reassign_driver'
  | 'transfer_vehicle'
  | 'cancelled';

export type PickupIncident = {
  id: string;
  pickup_order_id: string;
  pickup_stop_id: string | null;
  phase: IncidentPhase;
  kind: IncidentKind;
  description: string;
  reported_at: string;
  resolution: IncidentResolution | null;
  resolved_at: string | null;
};

export type PickupOrder = {
  id: string;
  business_id: string | null;
  crossdocking_location_id: string;
  driver_user_id: string;
  status: PickupOrderStatus;
  scheduled_date: string;
  scheduled_time_from: string | null;
  scheduled_time_to: string | null;
  driver_name_snapshot: string | null;
  driver_phone_snapshot: string | null;
  reject_reason: string | null;
  cancel_reason: string | null;
  notes: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  started_at: string | null;
  returning_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  stops: PickupStop[];
  crossdocking_location: { id: string; name: string } | null;
  business: { id: string; name: string } | null;
};
