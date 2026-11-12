// Integración con Mercado Libre Flex (escenario 11: app no instalada).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FLEX_ANDROID_PACKAGE,
  FLEX_PLAY_STORE_APP_URL,
  FLEX_PLAY_STORE_WEB_URL,
  flexOutcomeMessage,
  launchFlexApp,
} from '../src/modules/delivery/flexAppLauncher.ts';

function deps({ platform = 'android', installed = true, openable = [] } = {}) {
  const calls = [];
  return {
    calls,
    platform,
    openApplication: (pkg) => {
      calls.push(['app', pkg]);
      if (!installed) throw new Error('ActivityNotFoundException');
    },
    openUrl: async (url) => {
      calls.push(['url', url]);
      return openable.includes(url);
    },
  };
}

test('instalada: abre Flex por paquete, sin pasar por la tienda', async () => {
  const d = deps();
  assert.equal(await launchFlexApp(d), 'opened');
  assert.deepEqual(d.calls, [['app', FLEX_ANDROID_PACKAGE]]);
  assert.equal(flexOutcomeMessage('opened'), null);
});

test('11: no instalada → ficha oficial de Google Play (app)', async () => {
  const d = deps({ installed: false, openable: [FLEX_PLAY_STORE_APP_URL] });
  assert.equal(await launchFlexApp(d), 'store');
  assert.deepEqual(d.calls.map((c) => c[1]), [FLEX_ANDROID_PACKAGE, FLEX_PLAY_STORE_APP_URL]);
  assert.match(flexOutcomeMessage('store'), /no está instalada/);
});

test('11: no instalada y sin app de Play Store → Google Play web', async () => {
  const d = deps({ installed: false, openable: [FLEX_PLAY_STORE_WEB_URL] });
  assert.equal(await launchFlexApp(d), 'store');
});

test('11: nada se puede abrir → lo dice, no falla en silencio', async () => {
  const d = deps({ installed: false });
  assert.equal(await launchFlexApp(d), 'unavailable');
  assert.ok(flexOutcomeMessage('unavailable').length > 0);
});

test('iOS: sin enlace verificado no se intenta nada', async () => {
  const d = deps({ platform: 'ios' });
  assert.equal(await launchFlexApp(d), 'unsupported');
  assert.deepEqual(d.calls, []);
});

test('sólo URLs oficiales de Google Play; ningún esquema inventado', () => {
  assert.equal(FLEX_PLAY_STORE_APP_URL, `market://details?id=${FLEX_ANDROID_PACKAGE}`);
  assert.equal(FLEX_PLAY_STORE_WEB_URL, `https://play.google.com/store/apps/details?id=${FLEX_ANDROID_PACKAGE}`);
});
