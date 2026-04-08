import { calculateDistance } from '@core/geo/calculateDistance';
import { isValidLatLng } from '@core/geo/coordinates';

import type { ColectaWarehouse } from './types';

/**
 * Distance line for UI: km when both warehouse and user positions are valid,
 * "Sin ubicación" when the warehouse has no coordinates,
 * "—" when the warehouse has coords but user position is not ready.
 */
export function formatWarehouseDistanceLabel(
  warehouse: ColectaWarehouse,
  userLatitude: number | null,
  userLongitude: number | null,
): string {
  if (!isValidLatLng(warehouse.latitude, warehouse.longitude)) {
    return 'Sin ubicación';
  }
  if (
    userLatitude === null ||
    userLongitude === null ||
    !isValidLatLng(userLatitude, userLongitude)
  ) {
    return '—';
  }
  const km = calculateDistance(userLatitude, userLongitude, warehouse.latitude, warehouse.longitude);
  if (km === null) {
    return '—';
  }
  const decimals = km >= 100 ? 0 : 1;
  return `${km.toFixed(decimals)} km`;
}
