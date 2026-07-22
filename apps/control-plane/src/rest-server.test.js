import http from 'node:http';

import { createRestServer } from './rest-server.js';

const tokens = { 'admin-tok': 'admin', 'ro-tok': 'readonly' };

// Fake facade: echoes back for pool.status, forbids per RBAC-like behaviour.
const facade = {
  async execute(operation, { role, args, correlationId }) {
    if (operation === 'ghost') return { data: null, error: { code: 'UNKNOWN_OPERATION', message: 'x' }, meta: { operation, correlationId } };
    if (operation === 'account.retire' && role === 'readonly') {
      return { data: null, error: { code: 'FORBIDDEN', message: 'x' }, meta: { operation, correlationId } };
    }
    return { data: { operation, role, args }, error: null, meta: { operation, correlationId } };
  }
};

function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let server;
let port;
beforeAll(async () => {
  const app = createRestServer({ facade, tokens });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = server.address().port;
});
afterAll(() => server && server.close());

describe('REST control-plane', () => {
  test('GET /health is unauthenticated and ok', async () => {
    const res = await request(port, { path: '/health' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('rejects a missing/invalid bearer with 401', async () => {
    const res = await request(port, { method: 'POST', path: '/v1/op/pool.status' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('executes an operation and returns the envelope with correlation id', async () => {
    const res = await request(port, {
      method: 'POST',
      path: '/v1/op/pool.status',
      headers: { authorization: 'Bearer admin-tok', 'x-correlation-id': 'c9' },
      body: { platform: 'telegram' }
    });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
    expect(res.body.data.args).toEqual({ platform: 'telegram' });
    expect(res.body.meta.correlationId).toBe('c9');
  });

  test('maps FORBIDDEN to 403', async () => {
    const res = await request(port, {
      method: 'POST',
      path: '/v1/op/account.retire',
      headers: { authorization: 'Bearer ro-tok' },
      body: {}
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('maps UNKNOWN_OPERATION to 404', async () => {
    const res = await request(port, {
      method: 'POST',
      path: '/v1/op/ghost',
      headers: { authorization: 'Bearer admin-tok' },
      body: {}
    });
    expect(res.status).toBe(404);
  });
});
