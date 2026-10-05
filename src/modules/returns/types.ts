export type ReturnOrderStatus =
  | 'unassigned'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'returning_to_warehouse'
  | 'completed'
  | 'cancelled';

export type ReturnStopStatus =
  | 'pending'
  | 'en_route'
  | 'arrived'
  | 'scanning'
  | 'completed'
  | 'skipped';

/** Bulto que viaja de vuelta al seller. */
export type ReturnShipmentRef = {
  id: string;
  tracking: string;
  status_code: string;
};

/** Warehouse del seller: el domicilio de la parada. */
export type ReturnStopWarehouse = {
  id: string;
  name: string;
  address: string | null;
  business_id: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ReturnStop = {
  id: string;
  return_order_id: string;
  warehouse_id: string;
  sequence: number;
  status: ReturnStopStatus;
  skip_reason: string | null;
  arrived_lat: number | null;
  arrived_lng: number | null;
  en_route_at: string | null;
  arrived_at: string | null;
  scanning_started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  /** Conforme del seller. Sin esto el backend no deja cerrar la parada. */
  conforme_path: string | null;
  conforme_receiver_name: string | null;
  conforme_uploaded_at: string | null;
  warehouse: ReturnStopWarehouse | null;
  shipments: ReturnShipmentRef[];
};

export type ReturnOrder = {
  id: string;
  business_id: string | null;
  crossdocking_location_id: string;
  driver_user_id: string | null;
  status: ReturnOrderStatus;
  scheduled_date: string;
  scheduled_time_from: string | null;
  scheduled_time_to: string | null;
  reject_reason: string | null;
  cancel_reason: string | null;
  notes: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  started_at: string | null;
  returning_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  stops: ReturnStop[];
  crossdocking_location: { id: string; name: string } | null;
  business: { id: string; name: string } | null;
};
