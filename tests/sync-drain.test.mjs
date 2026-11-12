// Cola offline: orden por envío y fallas de red (escenarios 13 y 14).
// Corre con `npm run test:unit` (node --test, type stripping nativo de Node 22).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  backoffMsFor,
  classifySyncFailure,
  drainInOrder,
  MAX_BACKOFF_MS,
  pendingShipmentEvents,
} from '../src/core/sync/drainPlan.ts';

const ev = (id, type, shipmentId, createdAt, extra = {}) => ({
  id,
  type,
  payload: { shipmentId },
  createdAt,
  retries: 0,
  ...extra,
});

const netDown = { isAxiosError: true, response: undefined };
const http = (status) => ({ isAxiosError: true, response: { status } });

test('14: con IN_TRANSIT caído por red, el DELIVERED del mismo envío NO se adelanta', async () => {
  const queue = [
    ev('a', 'SHIPMENT_IN_TRANSIT', 'S1', 1),
    ev('b', 'SHIPMENT_DELIVERED', 'S1', 2),
    ev('c', 'SHIPMENT_DELIVERED', 'S2', 3),
  ];
  const sentOrder = [];
  const res = await drainInOrder(queue, () => 1000, async (e) => {
    sentOrder.push(e.id);
    return e.id === 'a' ? classifySyncFailure(netDown) : null;
  });

  assert.deepEqual(sentOrder, ['a', 'c'], 'b no se intenta: llegaría antes que su IN_TRANSIT');
  assert.deepEqual(res.heldBack.map((e) => e.id), ['b']);
  assert.deepEqual(res.failed.map((f) => [f.event.id, f.kind]), [['a', 'transient']]);
});

test('14: un evento en backoff también frena a los posteriores de su envío', async () => {
  const queue = [
    ev('a', 'SHIPMENT_IN_TRANSIT', 'S1', 1, { retries: 3, nextRetryAt: 5000 }),
    ev('b', 'SHIPMENT_DELIVERED', 'S1', 2),
  ];
  const sent = [];
  await drainInOrder(queue, () => 1000, async (e) => (sent.push(e.id), null));
  assert.deepEqual(sent, []);
});

test('14: al volver la red, la secuencia sale entera y en orden', async () => {
  const queue = [ev('b', 'SHIPMENT_DELIVERED', 'S1', 2), ev('a', 'SHIPMENT_IN_TRANSIT', 'S1', 1)];
  const sent = [];
  const res = await drainInOrder(queue, () => 1000, async (e) => (sent.push(e.id), null));
  assert.deepEqual(sent, ['a', 'b']);
  assert.equal(res.sent.length, 2);
});

test('una falla de red nunca agota el evento: un evento con 5+ reintentos se sigue enviando', async () => {
  // Antes, `retries >= 5` lo dejaba en la cola sin enviarse nunca más.
  const queue = [ev('old', 'SHIPMENT_DELIVERED', 'S1', 1, { retries: 7 })];
  const sent = [];
  await drainInOrder(queue, () => 1000, async (e) => (sent.push(e.id), null));
  assert.deepEqual(sent, ['old']);
  assert.ok(backoffMsFor(50) <= MAX_BACKOFF_MS);
  assert.equal(backoffMsFor(0), 1000);
});

test('una falla permanente no se reenvía y no traba al resto del envío', async () => {
  const queue = [
    ev('bad', 'SHIPMENT_NEAR_DESTINATION', 'S1', 1, { permanentFailure: { at: 1, status: 422 } }),
    ev('ok', 'SHIPMENT_DELIVERED', 'S1', 2),
  ];
  const sent = [];
  await drainInOrder(queue, () => 1000, async (e) => (sent.push(e.id), null));
  assert.deepEqual(sent, ['ok']);
  assert.deepEqual(pendingShipmentEvents(queue).map((e) => e.id), ['ok']);
});

test('el GPS no participa del orden', async () => {
  const queue = [
    ev('a', 'SHIPMENT_IN_TRANSIT', 'S1', 1, { nextRetryAt: 9999 }),
    { id: 'g', type: 'GPS_LOCATION', payload: { shipmentId: 'S1', points: [{}] }, createdAt: 2, retries: 0 },
  ];
  const sent = [];
  await drainInOrder(queue, () => 1000, async (e) => (sent.push(e.id), null));
  assert.deepEqual(sent, ['g']);
  assert.deepEqual(pendingShipmentEvents(queue).map((e) => e.id), ['a']);
});

test('clasificación de fallas', () => {
  assert.equal(classifySyncFailure(netDown), 'transient');
  assert.equal(classifySyncFailure(http(500)), 'transient');
  assert.equal(classifySyncFailure(http(503)), 'transient');
  assert.equal(classifySyncFailure(http(401)), 'transient');
  assert.equal(classifySyncFailure(http(429)), 'transient');
  assert.equal(classifySyncFailure(http(408)), 'transient');
  assert.equal(classifySyncFailure(http(422)), 'permanent');
  assert.equal(classifySyncFailure(http(400)), 'permanent');
  assert.equal(classifySyncFailure(new Error('payload mal armado')), 'permanent');
});

test('13: reintentar el mismo evento usa el mismo id (idempotencia del servidor)', async () => {
  const queue = [ev('same-id', 'SHIPMENT_DELIVERED', 'S1', 1)];
  const ids = [];
  let first = true;
  const send = async (e) => {
    ids.push(e.id);
    if (first) {
      first = false;
      return 'transient';
    }
    return null;
  };
  await drainInOrder(queue, () => 1000, send);
  await drainInOrder(queue, () => 1000, send);
  assert.deepEqual(ids, ['same-id', 'same-id']);
});
