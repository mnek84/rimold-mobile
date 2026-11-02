import { Linking, Platform } from 'react-native';

export type NavPoint = { latitude: number; longitude: number };

/**
 * Tope de puntos intermedios que acepta la Google Maps URLs API.
 *
 * No es una preferencia nuestra: `dir/?api=1` admite hasta 9 `waypoints` más el
 * `destination`. Pasarle 44 paradas no devuelve un error — devuelve un mapa con
 * las primeras y el resto silenciosamente ausentes, que es el peor desenlace
 * posible en la calle. Por eso el corte es explícito y la UI dice cuántas entran.
 */
export const MAX_GOOGLE_MAPS_WAYPOINTS = 9;

/** Cuántas paradas de `total` entran realmente en un link de Google Maps. */
export function navigableStopCount(total: number): number {
  return Math.min(total, MAX_GOOGLE_MAPS_WAYPOINTS + 1);
}

function coord(p: NavPoint): string {
  return `${p.latitude},${p.longitude}`;
}

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Navegación paso a paso hacia una parada.
 *
 * En Android se intenta primero `google.navigation:`, que entra directo en modo
 * guía en vez de abrir la ficha del lugar. El link universal `https` queda de
 * respaldo y funciona en los dos sistemas, con o sin la app instalada: no se
 * usa `canOpenURL` porque en iOS devuelve `false` sin declarar el esquema en
 * `LSApplicationQueriesSchemes`, y entonces descartaría un camino que sí anda.
 */
export async function openTurnByTurnNavigation(point: NavPoint): Promise<boolean> {
  const destination = coord(point);
  if (Platform.OS === 'android') {
    const opened = await open(`google.navigation:q=${destination}&mode=d`);
    if (opened) {
      return true;
    }
  }
  return open(
    `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`,
  );
}

/**
 * Abre el tramo siguiente de la ruta en Google Maps.
 *
 * Toma los puntos en el orden en que se le pasan (el de visita), recorta al
 * máximo que admite el link y arma origen implícito → waypoints → destino.
 */
export async function openRouteInGoogleMaps(points: NavPoint[]): Promise<boolean> {
  if (points.length === 0) {
    return false;
  }
  if (points.length === 1) {
    return openTurnByTurnNavigation(points[0]);
  }

  const slice = points.slice(0, navigableStopCount(points.length));
  const destination = slice[slice.length - 1];
  const waypoints = slice.slice(0, -1).map(coord).join('|');

  const url =
    `https://www.google.com/maps/dir/?api=1&destination=${coord(destination)}` +
    `&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;

  return open(url);
}
