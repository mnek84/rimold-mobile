const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Paquete Android de Mercado Envíos Flex (la app del repartidor).
 *
 * Tiene que estar también en `src/modules/delivery/flexApp.ts`. Son dos capas
 * distintas —manifiesto y runtime— y el valor es el mismo; si cambia, cambian
 * las dos o el botón deja de abrir nada sin decir por qué.
 */
const FLEX_PACKAGE = 'com.mercadoenvios.driver';

/**
 * Declara el paquete de Flex en `<queries>` del AndroidManifest.
 *
 * Desde Android 11 una app no ve el resto de las apps instaladas salvo que las
 * declare. Sin esta entrada `getLaunchIntentForPackage()` devuelve null **aunque
 * Flex esté instalada**, y el botón "Abrir Mercado Flex" mandaría al chofer a
 * la Play Store a instalar la app que ya tiene abierta al lado.
 *
 * Es configuración nativa: pide build nuevo, no alcanza con un update OTA.
 */
module.exports = function withFlexAppQuery(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!Array.isArray(manifest.queries)) {
      manifest.queries = [];
    }
    if (manifest.queries.length === 0) {
      manifest.queries.push({});
    }

    const query = manifest.queries[0];
    if (!Array.isArray(query.package)) {
      query.package = [];
    }

    const alreadyDeclared = query.package.some(
      (entry) => entry && entry.$ && entry.$['android:name'] === FLEX_PACKAGE,
    );

    if (!alreadyDeclared) {
      query.package.push({ $: { 'android:name': FLEX_PACKAGE } });
    }

    return cfg;
  });
};
