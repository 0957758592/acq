import http from 'node:http';

import { reconcileTick, startHealthServer } from './engine.js';

function fakeCtx({ platforms = ['telegram'], dispatcher = null } = {}) {
  return {
    activePlatforms: platforms,
    jobDispatcher: dispatcher,
    clock: { now: () => new Date('2026-07-22T09:00:00.000Z') },
    logger: { info: () => {}, error: () => {} }
  };
}

describe('reconcileTick', () => {
  it('plans intents across every active platform', async () => {
    const ctx = fakeCtx({ platforms: ['telegram', 'whatsapp'] });
    const planFn = async (_ctx, { platform }) => [{ type: 'acquire', platform }];
    const intents = await reconcileTick(ctx, { planFn });
    expect(intents.map((i) => i.platform)).toEqual(['telegram', 'whatsapp']);
  });

  it('dispatches each intent to its queue when a dispatcher is wired', async () => {
    const dispatched = [];
    const ctx = fakeCtx({
      platforms: ['telegram'],
      dispatcher: { dispatch: async (q, job) => dispatched.push({ q, job }) }
    });
    await reconcileTick(ctx, { planFn: async () => [{ type: 'acquire', platform: 'telegram' }] });
    expect(dispatched[0].q).toBe('engine.acquire');
  });

  it('isolates a failing platform without aborting the tick', async () => {
    const ctx = fakeCtx({ platforms: ['bad', 'telegram'] });
    const planFn = async (_ctx, { platform }) => {
      if (platform === 'bad') throw new Error('boom');
      return [{ type: 'acquire', platform }];
    };
    const intents = await reconcileTick(ctx, { planFn });
    expect(intents).toEqual([{ type: 'acquire', platform: 'telegram' }]);
  });
});

describe('reconcileTick metrics', () => {
  it('increments reconcile + intents counters', async () => {
    const inc = [];
    const ctx = fakeCtx({ platforms: ['telegram'] });
    ctx.metrics = {
      reconcileTicks: { inc: (l) => inc.push(['ticks', l]) },
      intentsDispatched: { inc: (l, n) => inc.push(['intents', l, n]) }
    };
    await reconcileTick(ctx, { planFn: async () => [{ type: 'acquire', platform: 'telegram' }] });
    expect(inc).toContainEqual(['ticks', { platform: 'telegram' }]);
    expect(inc).toContainEqual(['intents', { platform: 'telegram' }, 1]);
  });
});

describe('startHealthServer', () => {
  function get(port, pathname) {
    return new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
    });
  }

  it('responds 200 with the health payload on /health', async () => {
    const server = await startHealthServer(0, { onHealth: () => ({ status: 'ok', service: 'engine' }) });
    const { port } = server.address();
    const res = await get(port, '/health');
    server.close();
    expect(JSON.parse(res.body)).toEqual({ status: 'ok', service: 'engine' });
  });

  it('serves /metrics when onMetrics is provided', async () => {
    const server = await startHealthServer(0, { onMetrics: () => 'acq_test 1\n' });
    const { port } = server.address();
    const res = await get(port, '/metrics');
    server.close();
    expect(res.status).toBe(200);
    expect(res.body).toContain('acq_test 1');
  });
});
