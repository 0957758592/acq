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
    { uri: 'acq://devices', name: 'Devices', description: 'enrolled cloud-phone devices' },
    { uri: 'acq://scrape', name: 'Scrape results', description: 'normalized scraped read-models (group messages + authors, participants, members, profiles…) for grounding' },
    { uri: 'acq://metrics', name: 'Domain metrics', description: 'live pool depth, device occupancy/saturation, queue depth, ban share, active campaigns per platform' },
    { uri: 'acq://selectors', name: 'On-device selectors', description: 'per-platform on-device selector overrides (login/action/report) tuned for the live app build' }
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
      case 'acq://scrape':
        // Scraped read-models (Telegram group content + commenters, etc.) for the
        // brain to ground on — regardless of the tier that produced them (web / bot-api).
        return { results: ctx.scrapeResultRepo ? await ctx.scrapeResultRepo.listResults({}, { limit: 200 }) : [] };
      case 'acq://metrics':
        return { platforms: ctx.domainSnapshot ? await ctx.domainSnapshot() : [] };
      case 'acq://selectors':
        return { selectors: ctx.selectorStore ? await ctx.selectorStore.list() : [] };
      default:
        throw Object.assign(new Error(`RESOURCE_NOT_FOUND: ${uri}`), { code: 'RESOURCE_NOT_FOUND' });
    }
  }

  return {
    list: () => defs.map((d) => ({ uri: d.uri, name: d.name, description: d.description, mimeType: 'application/json' })),
    read
  };
}
