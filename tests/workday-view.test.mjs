// Vista de la jornada: conteos, filtro y textos (escenarios 1, 2, 3, 7, 9, 10).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  channelLines,
  countRows,
  finishOutcomeMessage,
  rowsForFilter,
  rowState,
  workdayStatusTitle,
} from '../src/modules/delivery/workdayView.ts';

const OWN = { operator: 'internal' };
const FLEX = { operator: 'mercadolibre_flex' };
const row = (status, channel, workday_state = null) => ({ status, channel, workday_state });

const summary = (over = {}) => ({
  totals: { total: 0, pending: 0, delivered: 0, incident: 0, cancelled: 0 },
  own: { total: 0, pending: 0, delivered: 0, incident: 0, cancelled: 0, state: 'none', route: null },
  flex: { total: 0, pending: 0, delivered: 0, incident: 0, cancelled: 0, state: 'none', awaitingMl: 0, syncPending: 0, openShipments: [], batchCount: 0 },
  workday: { status: 'no_work', canFinishRoute: false, notices: [] },
  ...over,
});

test('el estado de jornada lo decide el backend; el cálculo local es sólo compatibilidad', () => {
  assert.equal(rowState(row('out_for_delivery', OWN, 'delivered')), 'delivered');
  assert.equal(rowState(row('return_pending_intake', OWN)), 'incident');
  assert.equal(rowState(row('cancelled', OWN)), 'cancelled');
  assert.equal(rowState(row('assigned', FLEX)), 'pending');
});

test('3: jornada mixta — conteos por estado y por tipo son disjuntos y suman el total', () => {
  const rows = [
    row('assigned', OWN, 'pending'),
    row('delivered', OWN, 'delivered'),
    row('return_pending_intake', OWN, 'incident'),
    row('out_for_delivery', FLEX, 'pending'),
    row('delivered', FLEX, 'delivered'),
    row('cancelled', FLEX, 'cancelled'),
  ];
  const c = countRows(rows);
  assert.equal(c.total, 6);
  assert.equal(c.pending + c.delivered + c.incident, c.total);
  assert.equal(c.own + c.flex, c.total);
  assert.deepEqual([c.ownPending, c.flexPending], [1, 1]);
  assert.equal(c.incident, 2, 'un cancelado va con incidencias, no con pendientes');
  assert.equal(rowsForFilter(rows, 'pending').length, 2);
  assert.deepEqual(channelLines(c), ['3 propios · se confirman en esta app', '3 Flex · se confirman en Mercado Libre Flex']);
});

test('1 y 2: con un solo tipo, el resumen no menciona el otro', () => {
  assert.deepEqual(channelLines(countRows([row('assigned', OWN, 'pending')])), ['1 propio · se confirman en esta app']);
  assert.deepEqual(channelLines(countRows([row('assigned', FLEX, 'pending')])), ['1 Flex · se confirman en Mercado Libre Flex']);
});

test('7: sólo Flex, sin ruta propia — nunca "No hay ruta propia para finalizar"', () => {
  const s = summary({
    flex: { ...summary().flex, total: 2, pending: 2, awaitingMl: 2, state: 'open' },
    workday: { status: 'flex_pending', canFinishRoute: false, notices: [] },
  });
  const msg = finishOutcomeMessage({ ownResult: 'no_route', summary: s });
  assert.doesNotMatch(msg, /No hay ruta propia/);
  assert.match(msg, /2 envíos Flex siguen pendientes/);
  assert.match(msg, /Mercado Libre Flex/);
  assert.equal(workdayStatusTitle(s), 'Faltan 2 envíos Flex en Mercado Libre Flex');
});

test('9: cierre parcial — ruta propia cerrada, Flex pendientes explicados', () => {
  const s = summary({
    own: { ...summary().own, total: 2, delivered: 1, incident: 1, state: 'closed' },
    flex: { ...summary().flex, total: 1, pending: 1, awaitingMl: 1, state: 'open' },
    workday: { status: 'flex_pending', canFinishRoute: false, notices: [] },
  });
  const msg = finishOutcomeMessage({ ownResult: 'finished', summary: s });
  assert.match(msg, /Tu ruta propia quedó finalizada/);
  assert.match(msg, /1 envío Flex sigue pendiente en Mercado Libre/);
});

test('6: Flex ya informado por ML pero sin sincronizar', () => {
  const s = summary({
    flex: { ...summary().flex, total: 1, pending: 1, awaitingMl: 0, syncPending: 1, state: 'sync_pending' },
    workday: { status: 'flex_pending', canFinishRoute: false, notices: [] },
  });
  assert.equal(workdayStatusTitle(s), 'Sincronizando envíos Flex con Mercado Libre');
});

test('10: todo cerrado — jornada completa', () => {
  const s = summary({
    own: { ...summary().own, total: 1, delivered: 1, state: 'closed' },
    flex: { ...summary().flex, total: 1, delivered: 1, state: 'closed' },
    workday: { status: 'completed', canFinishRoute: false, notices: [] },
  });
  const msg = finishOutcomeMessage({ ownResult: 'finished', summary: s });
  assert.match(msg, /^Jornada completa\./);
  assert.match(msg, /Todos tus envíos Flex ya fueron informados/);
  assert.equal(workdayStatusTitle(s), 'Jornada completa');
});

test('cierre repetido: se informa que ya estaba cerrada', () => {
  const s = summary({ own: { ...summary().own, total: 1, delivered: 1, state: 'closed' }, workday: { status: 'completed', canFinishRoute: false, notices: [] } });
  assert.match(finishOutcomeMessage({ ownResult: 'already_finished', summary: s }), /ya estaba finalizada/);
});
