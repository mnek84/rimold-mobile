import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

/**
 * Paquete Android de Mercado Envíos Flex (la app del repartidor).
 *
 * Replicado en `plugins/withFlexAppQuery.js`, que lo declara en `<queries>` del
 * AndroidManifest. Sin esa declaración Android 11+ esconde la app instalada y
 * esto cae siempre a la Play Store.
 */
export const FLEX_ANDROID_PACKAGE = 'com.mercadoenvios.driver';

const PLAY_STORE_APP = `market://details?id=${FLEX_ANDROID_PACKAGE}`;
const PLAY_STORE_WEB = `https://play.google.com/store/apps/details?id=${FLEX_ANDROID_PACKAGE}`;

export type FlexAppOpenOutcome =
  /** Flex se abrió. */
  | 'opened'
  /** No está instalada: se abrió su ficha en la tienda. */
  | 'store'
  /** No se pudo hacer ninguna de las dos cosas. */
  | 'unavailable'
  /** Esta plataforma no tiene un camino conocido hacia Flex. */
  | 'unsupported';

/**
 * Sólo Android tiene un camino verificado.
 *
 * `com.mercadoenvios.driver` es un identificador de paquete Android; en iOS la
 * app de Flex se abre por esquema de URL y no tenemos uno confirmado. Antes que
 * ofrecer un botón que falle en silencio frente al comprador, en iOS no se
 * ofrece: la tarjeta igual avisa que el envío lo cierra Flex, que es la mitad
 * que sí podemos sostener.
 */
export function canOpenFlexApp(): boolean {
  return Platform.OS === 'android';
}

async function openUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre Mercado Envíos Flex, o su ficha en la tienda si no está instalada.
 *
 * `openApplication` lanza cuando el paquete no se resuelve, y ese es el único
 * aviso que da Android: no hay forma de preguntar primero sin la declaración
 * de `<queries>`, así que el intento ES la consulta.
 */
export async function openMercadoFlexApp(): Promise<FlexAppOpenOutcome> {
  if (!canOpenFlexApp()) {
    return 'unsupported';
  }

  try {
    IntentLauncher.openApplication(FLEX_ANDROID_PACKAGE);
    return 'opened';
  } catch {
    // No instalada, o invisible para esta app. Las dos se resuelven igual.
  }

  if (await openUrl(PLAY_STORE_APP)) {
    return 'store';
  }
  if (await openUrl(PLAY_STORE_WEB)) {
    return 'store';
  }

  return 'unavailable';
}
