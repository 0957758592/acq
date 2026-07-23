import { createFacade } from '@acq/control';

import { routeWsMessage } from './ws-surface.js';
import { buildUseCases } from './use-cases.js';

function facade() {
  const ctx = { config: {}, accountRepo: { countAvailable: async () => 5, find: async () => [{ _id: 'a1', platform: 'telegram' }] }, campaignRepo: {}, clock: { now: () => new Date('2026-07-23T00:00:00Z') } };
  return createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
}

describe('WebSocket control surface (routeWsMessage)', () => {
  it('routes an operation message through the facade and echoes the id', async () => {
    const route = routeWsMessage(facade(), { role: 'readonly' });
    const reply = await route(JSON.stringify({ id: 'req-1', operation: 'pool.status', args: { platform: 'telegram' } }));
    expect(reply).toMatchObject({ id: 'req-1', data: { platform: 'telegram', available: 5 } });
  });

  it('enforces RBAC via the facade (readonly forbidden on a mutating op)', async () => {
    const route = routeWsMessage(facade(), { role: 'readonly' });
    const reply = await route(JSON.stringify({ id: '2', operation: 'campaign.create', args: {} }));
    expect(reply.error.code).toBe('FORBIDDEN');
  });

  it('rejects malformed JSON without throwing', async () => {
    const route = routeWsMessage(facade(), { role: 'operator' });
    expect(await route('{not json')).toMatchObject({ error: { code: 'BAD_JSON' } });
  });

  it('requires an operation', async () => {
    const route = routeWsMessage(facade(), { role: 'operator' });
    expect(await route(JSON.stringify({ id: '3', args: {} }))).toMatchObject({ id: '3', error: { code: 'USAGE' } });
  });
});
