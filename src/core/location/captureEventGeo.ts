import * as Location from 'expo-location';

/**
 * Posición del chofer en el momento de cerrar una entrega o una no-entrega.
 *
 * Misma forma que la que el backend ya guarda en `proof_of_delivery.geo`
 * (`ShipmentDeliveredProofProcessor`): claves planas y valores escalares, nada
 * anidado.
 */
export type EventGeo = {
  lat: number;
  lng: number;
  /** Precisión horizontal reportada por el dispositivo, en metros. */
  accuracy_m?: number;
  /** Hora de la medición, no la del envío del evento. */
  captured_at: string;
  /**
   * `true` cuando el punto salió de la última posición conocida del sistema en
   * lugar de una medición nueva. Viaja con el dato porque una coordenada de
   * hace diez minutos y una de hace diez segundos no valen lo mismo cuando se
   * discute si el chofer estuvo en la puerta.
   */
  stale?: boolean;
};

/** Más que esto y el chofer siente que la app se colgó al confirmar. */
const FIX_TIMEOUT_MS = 4000;

function toGeo(
  position: Location.LocationObject,
  stale: boolean,
): EventGeo {
  const geo: EventGeo = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    captured_at: new Date(position.timestamp).toISOString(),
  };
  if (typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)) {
    geo.accuracy_m = Math.round(position.coords.accuracy);
  }
  if (stale) {
    geo.stale = true;
  }
  return geo;
}

/**
 * Intenta ubicar al dispositivo sin bloquear la operación.
 *
 * Devuelve `null` —nunca lanza— ante permiso denegado, GPS apagado, o un fix
 * que tarda más de {@link FIX_TIMEOUT_MS}. Es deliberado: el chofer está en la
 * puerta del comprador con el paquete en la mano, y una entrega que no se puede
 * confirmar porque el GPS no engancha es un problema mucho peor que una entrega
 * sin coordenada. La ubicación es evidencia, no un requisito.
 *
 * No pide permisos: si el chofer no los otorgó, el gate de la app ya se lo
 * pidió al iniciar sesión y este no es el momento de volver a interrumpirlo.
 */
export async function captureEventGeo(): Promise<EventGeo | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      return null;
    }
  } catch {
    return null;
  }

  // Se arranca por la última conocida para tener algo que devolver aunque el
  // fix nuevo no llegue nunca.
  let fallback: EventGeo | null = null;
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
    if (last != null) {
      fallback = toGeo(last, true);
    }
  } catch {
    // Sin última posición conocida: se sigue, el fix nuevo puede alcanzar.
  }

  try {
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
    if (fresh != null) {
      return toGeo(fresh, false);
    }
  } catch {
    // Igual que arriba: se devuelve lo que haya.
  }

  return fallback;
}
