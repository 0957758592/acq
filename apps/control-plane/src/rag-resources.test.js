import { buildRagResources } from './rag-resources.js';

function fakeCtx(overrides = {}) {
  return {
    accountRepo: { countAvailable: async () => 0, find: async () => [{ platform: 'telegram', identifier: '@a', secretRefs: { session: 'vault:x' } }] },
    campaignRepo: { listActiveCampaigns: async () => [] },
    proxyRepo: { list: async () => [] },
    deviceModel: { find: () => ({ lean: async () => [] }) },
    scrapeResultRepo: {
      listResults: async () => [
        { platform: 'telegram', type: 'message', target: 'g1', data: { author: '@ann', text: 'how to reset?' } },
        { platform: 'telegram', type: 'participant', target: 'g1', data: { handle: '@bob' } }
      ]
    },
    ...overrides
  };
}

describe('buildRagResources', () => {
  it('lists an acq://scrape resource for scraped read-models', () => {
    const uris = buildRagResources(fakeCtx()).list().map((d) => d.uri);
    expect(uris).toContain('acq://scrape');
  });

  it('reads scraped results (group content + authors) for the brain to ground on', async () => {
    const out = await buildRagResources(fakeCtx()).read('acq://scrape');
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({ platform: 'telegram', type: 'message', data: { author: '@ann', text: 'how to reset?' } });
  });

  it('accounts resource strips secrets', async () => {
    const out = await buildRagResources(fakeCtx()).read('acq://accounts');
    expect(out.accounts[0].secretRefs).toBeUndefined();
  });

  it('an unknown resource is a coded error', async () => {
    await expect(buildRagResources(fakeCtx()).read('acq://nope')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
});
