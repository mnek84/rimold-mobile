const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let activeShipmentId: string | null = null;

export function setGpsActiveShipmentId(id: string | null): void {
  if (id === null) {
    activeShipmentId = null;
    return;
  }
  const t = id.trim();
  if (!UUID_V4.test(t)) {
    throw new Error('GPS tracking requires a valid shipment UUID');
  }
  activeShipmentId = t;
}

export function getGpsActiveShipmentId(): string | null {
  return activeShipmentId;
}
