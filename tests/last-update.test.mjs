// "Última actualización" de una tarea de la jornada (Entregas y Paradas).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatLastUpdate } from '../src/modules/delivery/lastUpdate.ts';

test('mismo día: sólo la hora', () => {
  const now = new Date(2026, 10, 12, 18, 0);
  const at = new Date(2026, 10, 12, 14, 5);
  assert.equal(formatLastUpdate(at.toISOString(), now), 'Actualizado hoy 14:05');
});

test('otro día: fecha y hora', () => {
  const now = new Date(2026, 10, 12, 9, 0);
  const at = new Date(2026, 10, 10, 22, 14);
  assert.equal(formatLastUpdate(at.toISOString(), now), 'Actualizado 10/11 22:14');
});

test('sin dato o inválido: null (la UI no inventa una hora)', () => {
  assert.equal(formatLastUpdate(null), null);
  assert.equal(formatLastUpdate(''), null);
  assert.equal(formatLastUpdate('no-es-fecha'), null);
});
