import http from 'node:http';

import { createDashboardServer } from './server.js';

function request(port, pathname) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: pathname }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
  });
}

let server;
let port;
beforeAll(async () => {
  const app = createDashboardServer({ apiOrigin: 'https://cp.example' });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = server.address().port;
});
afterAll(() => server && server.close());

describe('dashboard server', () => {
  test('/health responds ok', async () => {
    const res = await request(port, '/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).service).toBe('dashboard');
  });

  test('serves the SPA shell with a strict CSP header', async () => {
    const res = await request(port, '/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Operator Dashboard');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain('https://cp.example');
  });

  test('exposes the runtime api origin via /config.js', async () => {
    const res = await request(port, '/config.js');
    expect(res.body).toContain('window.__ACQ_API__');
    expect(res.headers['content-type']).toContain('javascript');
  });
});
