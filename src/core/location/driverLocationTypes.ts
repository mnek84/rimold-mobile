/**
 * Local row for driver position uploads (SQLite + sync worker).
 * `synced` is cleared from the device after a successful POST (server is source of truth).
 */
export type PendingLocation = {
  id: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  /** Unix time in milliseconds (device clock). */
  timestamp: number;
  synced: boolean;
  /**
   * PickupOrder activa al momento de la captura del fix. Se envía al backend
   * para ligar los puntos a la orden y habilitar el broadcast por canal
   * pickup-orders.{orderId} + el replay histórico del recorrido.
   */
  pickup_order_id?: string | null;
};

export type DriverLocationTrackingStatus = {
  /** Human-readable reason when tracking cannot run (permissions, web, etc.). */
  blockedReason: string | null;
};
