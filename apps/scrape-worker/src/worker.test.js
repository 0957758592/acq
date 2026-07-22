import http from 'node:http';

import { startHealthServer } from './worker.js';

describe('scrape-worker startHealthServer', () => {
  it('responds ok on /health', async () => {
    const server = await startHealthServer(0);
    const { port } = server.address();
    const body = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/health`, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(d));
      });
    });
    server.close();
    expect(JSON.parse(body)).toEqual({ status: 'ok', service: 'scrape-worker' });
  });
});
