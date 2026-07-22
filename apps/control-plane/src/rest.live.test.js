// LIVE end-to-end: real REST server -> facade -> live Mongo. Runs only under
// `test:live`. Proves the whole control-plane path serves real pool data.
import http from 'node:http';

import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineAuditLog } from '@acq/core/models/engine-audit-log';
import { main } from './server.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'e2etest';
const tokens = { 'admin-tok': 'admin', 'ro-tok': 'readonly' };

function request(port, { method = 'POST', path, headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json', ...headers } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
      }
    );
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let app;
let port;
beforeAll(async () => {
  app = await main({ env: { mongoUri: URI, port: 0, tokens, platforms: ['telegram'] } });
  port = app.server.address().port;
  await EngineAccount.deleteMany({ platform: PLATFORM });
});
afterAll(async () => {
  await EngineAccount.deleteMany({ platform: PLATFORM });
  await app.shutdown();
});

describe('control-plane REST over LIVE Mongo', () => {
  test('pool.status returns the live available count', async () => {
    await EngineAccount.insertMany([
      { platform: PLATFORM, identifier: '@cp_1', status: 'acquired', assignedDeviceId: null, version: 0 },
      { platform: PLATFORM, identifier: '@cp_2', status: 'acquired', assignedDeviceId: null, version: 0 },
      { platform: PLATFORM, identifier: '@cp_3', status: 'online', assignedDeviceId: 'd1', version: 3 }
    ]);
    const res = await request(port, {
      path: '/v1/op/pool.status',
      headers: { authorization: 'Bearer admin-tok' },
      body: { platform: PLATFORM }
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ platform: PLATFORM, available: 2 });
  });

  test('a mutating operation is persisted to the immutable audit log', async () => {
    // Append-only: use the raw collection to reset (mongoose deleteMany is blocked).
    await EngineAuditLog.collection.deleteMany({ correlationId: 'audit-c1' });
    await request(port, {
      path: '/v1/op/reconcile.now',
      headers: { authorization: 'Bearer admin-tok', 'x-correlation-id': 'audit-c1' },
      body: { platform: PLATFORM }
    });
    const entry = await EngineAuditLog.findOne({ operation: 'reconcile.now', correlationId: 'audit-c1' }).lean();
    expect(entry).not.toBeNull();
    expect(entry.actor).toBe('admin-tok');
    expect(entry.role).toBe('admin');
    await EngineAuditLog.collection.deleteMany({ correlationId: 'audit-c1' });
  });

  test('readonly may read pool.status but not retire an account', async () => {
    const ok = await request(port, {
      path: '/v1/op/pool.status',
      headers: { authorization: 'Bearer ro-tok' },
      body: { platform: PLATFORM }
    });
    expect(ok.status).toBe(200);

    const forbidden = await request(port, {
      path: '/v1/op/account.retire',
      headers: { authorization: 'Bearer ro-tok' },
      body: { accountId: 'x' }
    });
    expect(forbidden.status).toBe(403);
  });
});
