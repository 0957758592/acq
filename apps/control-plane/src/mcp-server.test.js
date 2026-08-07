import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFacade } from '@acq/control';

import { buildUseCases } from './use-cases.js';
import { createAcqMcpServer } from './mcp-server.js';

function fakeCtx() {
  const campaigns = {};
  let seq = 0;
  return {
    clock: { now: () => new Date('2026-07-23T00:00:00Z') },
    config: { buyBatchSize: 5 },
    accountRepo: {
      countAvailable: async () => 4,
      find: async () => [{ _id: 'a1', platform: 'telegram', status: 'online', secretRefs: { session: 'vault:x' } }]
    },
    campaignRepo: {
      createCampaign: async (input) => { const _id = `c${(seq += 1)}`; campaigns[_id] = { _id, ...input }; return campaigns[_id]; },
      listActiveCampaigns: async () => Object.values(campaigns).filter((c) => c.status === 'active')
    },
    proxyRepo: { list: async () => [{ _id: 'px1', status: 'available' }] },
    deviceModel: { find: () => ({ lean: async () => [{ _id: 'd1', providerDeviceId: 'PAD' }] }) }
  };
}

async function connectedClient() {
  const ctx = fakeCtx();
  const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
  const { attachTransport } = createAcqMcpServer({ facade, ctx, role: 'brain' });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await attachTransport(serverT);
  const client = new Client({ name: 'test-brain', version: '1.0' }, { capabilities: {} });
  await client.connect(clientT);
  return { client, ctx };
}

describe('acq MCP server (real protocol round-trip over in-memory transport)', () => {
  it('lists all 57 operations as MCP tools', async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.length).toBe(57);
    expect(tools.map((t) => t.name)).toContain('campaign.create');
    await client.close();
  });

  it('calls a tool through the facade (brain role) and returns the envelope data', async () => {
    const { client } = await connectedClient();
    const res = await client.callTool({ name: 'pool.status', arguments: { platform: 'telegram' } });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ platform: 'telegram', available: 4 });
    expect(res.isError).toBeFalsy();
    await client.close();
  });

  it('surfaces a coded facade error as an MCP tool error (not a throw)', async () => {
    const { client } = await connectedClient();
    const res = await client.callTool({ name: 'campaign.create', arguments: { platform: 'telegram' } }); // missing actionType
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).code).toBe('ACTION_TYPE_REQUIRED');
    await client.close();
  });

  it('exposes acq:// RAG read-models as MCP resources with secrets stripped', async () => {
    const { client } = await connectedClient();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(
      expect.arrayContaining(['acq://pool/summary', 'acq://accounts', 'acq://campaigns', 'acq://proxies', 'acq://devices'])
    );
    const read = await client.readResource({ uri: 'acq://accounts' });
    const body = JSON.parse(read.contents[0].text);
    expect(body.accounts[0].platform).toBe('telegram');
    expect(body.accounts[0].secretRefs).toBeUndefined(); // secrets stripped
    await client.close();
  });
});
