/**
 * Lógica pura para abrir la app de Mercado Libre Flex (sin imports de RN, para
 * poder probarla con `node --test`; ver `mobile/tests/flex-app-launcher.test.mjs`).
 *
 * Qué está verificado y qué no (revisado 2026-11):
 *  - Android: la ficha de Google Play `com.mercadoenvios.driver` existe
 *    ("Envíos Flex"). Abrir una app por su paquete es el mecanismo estándar de
 *    Android (`getLaunchIntentForPackage`), no un esquema inventado.
 *  - Abrir un ENVÍO puntual dentro de Flex: Mercado Libre no documenta ningún
 *    deep link para eso. No se arma ninguna URL "probable": se abre la app.
 *  - iOS: no hay esquema de URL ni id de App Store verificados. No se ofrece un
 *    salto que podría fallar frente al comprador; se indica abrirla a mano.
 */

export const FLEX_ANDROID_PACKAGE = 'com.mercadoenvios.driver';

export const FLEX_PLAY_STORE_APP_URL = `market://details?id=${FLEX_ANDROID_PACKAGE}`;
export const FLEX_PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${FLEX_ANDROID_PACKAGE}`;

export type FlexAppOpenOutcome =
  /** Flex se abrió. */
  | 'opened'
  /** No está instalada: se abrió su ficha oficial en Google Play. */
  | 'store'
  /** No se pudo abrir ni la app ni la tienda. */
  | 'unavailable'
  /** Esta plataforma no tiene un camino verificado hacia Flex. */
  | 'unsupported';

export type FlexLaunchDeps = {
  platform: string;
  /** Lanza la app por paquete. DEBE lanzar si el paquete no se resuelve. */
  openApplication: (androidPackage: string) => void | Promise<void>;
  /** Abre una URL; `false` si no hubo quién la atienda. */
  openUrl: (url: string) => Promise<boolean>;
};

export function canLaunchFlexOn(platform: string): boolean {
  return platform === 'android';
}

/**
 * Abre Flex; si no está instalada, su ficha en Google Play (app y después web).
 *
 * En Android el intento de abrir ES la consulta de "¿está instalada?": con el
 * paquete declarado en `<queries>` (plugin `withFlexAppQuery`) el launch
 * intent se resuelve si la app existe, y lanza si no.
 */
export async function launchFlexApp(deps: FlexLaunchDeps): Promise<FlexAppOpenOutcome> {
  if (!canLaunchFlexOn(deps.platform)) {
    return 'unsupported';
  }

  try {
    await deps.openApplication(FLEX_ANDROID_PACKAGE);
    return 'opened';
  } catch {
    // No instalada (o invisible para esta app): cae a la tienda.
  }

  if (await deps.openUrl(FLEX_PLAY_STORE_APP_URL)) {
    return 'store';
  }
  if (await deps.openUrl(FLEX_PLAY_STORE_WEB_URL)) {
    return 'store';
  }
  return 'unavailable';
}

/** Mensaje para el chofer según el resultado (null = no hace falta decir nada). */
export function flexOutcomeMessage(outcome: FlexAppOpenOutcome): string | null {
  switch (outcome) {
    case 'opened':
      return null;
    case 'store':
      return 'Mercado Libre Flex no está instalada. Te llevamos a Google Play para instalarla.';
    case 'unavailable':
      return 'No pudimos abrir Mercado Libre Flex ni Google Play. Abrila desde la pantalla de inicio.';
    case 'unsupported':
      return 'Abrí Mercado Libre Flex desde la pantalla de inicio para confirmar la entrega.';
  }
}
