import { calculateDistance } from '@core/geo/calculateDistance';
import { isValidLatLng } from '@core/geo/coordinates';

import type { ColectaClient, ColectaWarehouse } from './types';

function hasWarehouseCoords(w: ColectaWarehouse): boolean {
  return isValidLatLng(w.latitude, w.longitude);
}

/**
 * Warehouses with valid coordinates first (ascending distance to the user when user position is known),
 * then warehouses without coordinates (original relative order preserved).
 */
export function sortWarehousesByDistanceToUser(
  warehouses: ColectaWarehouse[],
  userLatitude: number | null,
  userLongitude: number | null,
  sortByDistance: boolean,
): ColectaWarehouse[] {
  if (!sortByDistance) {
    return [...warehouses];
  }

  const located: ColectaWarehouse[] = [];
  const unlocated: ColectaWarehouse[] = [];
  for (const w of warehouses) {
    if (hasWarehouseCoords(w)) {
      located.push(w);
    } else {
      unlocated.push(w);
    }
  }

  const userOk =
    userLatitude !== null &&
    userLongitude !== null &&
    isValidLatLng(userLatitude, userLongitude);

  if (userOk) {
    located.sort((a, b) => {
      const da = calculateDistance(userLatitude, userLongitude, a.latitude, a.longitude);
      const db = calculateDistance(userLatitude, userLongitude, b.latitude, b.longitude);
      return (da ?? Number.POSITIVE_INFINITY) - (db ?? Number.POSITIVE_INFINITY);
    });
  }

  return [...located, ...unlocated];
}

/** Applies {@link sortWarehousesByDistanceToUser} to each client's `warehouses` array. */
export function sortClientsWarehousesByUserDistance(
  clients: ColectaClient[],
  userLatitude: number | null,
  userLongitude: number | null,
  sortByDistance: boolean,
): ColectaClient[] {
  return clients.map((c) => ({
    ...c,
    warehouses: sortWarehousesByDistanceToUser(c.warehouses, userLatitude, userLongitude, sortByDistance),
  }));
}
