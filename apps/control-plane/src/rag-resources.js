// RAG / MCP read-model resources (TZ §11.3) — read-only `acq://…` views over the
// engine state for the brain to ground on. Secrets are stripped (only refs never
// leave, and even refs are dropped here). One definition, exposed as MCP
// resources; the same read functions can back an HTTP RAG endpoint.
function stripAccount(a) {
  const safe = { ...a }; // never surface secret material
  delete safe.secretRefs;
  delete safe.credentials;
  return safe;
}

export function buildRagResources(ctx) {
  const defs = [
    { uri: 'acq://pool/summary', name: 'Pool summary', description: 'available account counts' },
    { uri: 'acq://accounts', name: 'Accounts', description: 'account inventory (secrets stripped)' },
    { uri: 'acq://campaigns', name: 'Active campaigns', description: 'active action campaigns' },
    { uri: 'acq://proxies', name: 'Proxy pool', description: '1:1 sticky proxy pool' },
    { uri: 'acq://devices', name: 'Devices', description: 'enrolled cloud-phone devices' }
  ];

  async function read(uri) {
    switch (uri) {
      case 'acq://pool/summary':
        return { available: await ctx.accountRepo.countAvailable({}) };
      case 'acq://accounts':
        return { accounts: (await ctx.accountRepo.find({})).map(stripAccount) };
      case 'acq://campaigns':
        return { campaigns: await ctx.campaignRepo.listActiveCampaigns() };
      case 'acq://proxies':
        return { proxies: ctx.proxyRepo ? await ctx.proxyRepo.list({}) : [] };
      case 'acq://devices':
        return { devices: ctx.deviceModel ? await ctx.deviceModel.find({}).lean() : [] };
      default:
        throw Object.assign(new Error(`RESOURCE_NOT_FOUND: ${uri}`), { code: 'RESOURCE_NOT_FOUND' });
    }
  }

  return {
    list: () => defs.map((d) => ({ uri: d.uri, name: d.name, description: d.description, mimeType: 'application/json' })),
    read
  };
}
