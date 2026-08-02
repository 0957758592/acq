import { createFacade } from '@acq/control';

import { buildAgentCard, handleA2aTask } from './a2a-surface.js';
import { buildUseCases } from './use-cases.js';

function facade() {
  const ctx = { config: {}, accountRepo: { countAvailable: async () => 3 }, campaignRepo: { createCampaign: async (i) => ({ _id: 'c1', ...i }) }, clock: { now: () => new Date('2026-07-23T00:00:00Z') } };
  return createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
}

describe('A2A surface', () => {
  it('agent card advertises every operation as a skill', () => {
    const card = buildAgentCard({ baseUrl: 'http://x' });
    expect(card.skills.length).toBe(51);
    expect(card.url).toBe('http://x/a2a');
    expect(card.skills.map((s) => s.id)).toContain('campaign.create');
  });

  it('handles a task by skill through the facade -> completed', async () => {
    const task = handleA2aTask(facade(), { role: 'readonly' });
    const res = await task({ id: 't1', skill: 'pool.status', args: { platform: 'telegram' } });
    expect(res.status.state).toBe('completed');
    expect(res.artifacts[0].parts[0].data).toMatchObject({ platform: 'telegram', available: 3 });
  });

  it('handles a message-envelope task', async () => {
    const task = handleA2aTask(facade(), { role: 'operator' });
    const res = await task({ id: 't2', message: { parts: [{ data: { operation: 'campaign.create', args: { platform: 'telegram', actionType: 'report' } } }] } });
    expect(res.status.state).toBe('completed');
  });

  it('maps a facade error to a failed task', async () => {
    const task = handleA2aTask(facade(), { role: 'readonly' });
    const res = await task({ id: 't3', skill: 'campaign.create', args: {} });
    expect(res.status.state).toBe('failed');
    expect(res.error.code).toBe('FORBIDDEN');
  });
});
