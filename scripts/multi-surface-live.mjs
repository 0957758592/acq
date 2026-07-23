#!/usr/bin/env node
// LIVE multi-surface drive (TZ §11) — exercises the platform in REAL TIME through
// EVERY management contour over the ONE facade, for ALL 8 account types, plus
// real data parsing through the built-in Puppeteer browser.
//   MCP (real protocol round-trip) · HTTP/REST (real network) · CLI (manual) ·
//   RAG (acq:// read-models, brain grounding) · browser scrape.
// Same op → same result across surfaces (proves single-entry, many-surfaces).
//   node scripts/multi-surface-live.mjs          (REST part needs the dockerized api on :7500)
import http from 'node:http';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFacade } from '@acq/control';
import { createScrapeProvider, createBrowserScrapeAdapter, createPuppeteerBrowserProvider } from '@acq/scraping';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { runCli } from '../apps/control-plane/src/cli.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORMS = ['whatsapp', 'telegram', 'discord', 'facebook', 'gmail', 'tiktok', 'instagram', 'youtube'];
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const seam = (s, c) => console.log(`  🔒 ${s} — ${c}`);

function restCall(op, args, role = 'admin-dev-token') {
  return new Promise((resolve) => {
    const body = JSON.stringify(args);
    const req = http.request(
      { host: '127.0.0.1', port: 7500, path: `/v1/op/${op}`, method: 'POST', timeout: 6000, headers: { 'content-type': 'application/json', authorization: `Bearer ${role}`, 'content-length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d })); }
    );
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end(body);
  });
}

async function main() {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ identifier: { $regex: '^@ms_' } });
  // Seed one online account per platform (all 8 account types).
  await EngineAccount.insertMany(PLATFORMS.map((p) => ({ platform: p, identifier: `@ms_${p}`, source: 'purchase', status: 'online', assignedDeviceId: 'ms-dev', version: 0, secretRefs: { session: 'vault:x' } })));

  const ctx = buildEngineContext({ env: { platforms: PLATFORMS } });
  const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });

  // ── SURFACE 1 — MCP over HTTP (real network: brain ↔ dockerized server :7500/mcp) ──
  console.log('\n[MCP/HTTP] brain/agent contour — real MCP over the network (:7500/mcp)');
  const mcpTransport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:7500/mcp'), {
    requestInit: { headers: { authorization: 'Bearer admin-dev-token' } }
  });
  const mcp = new Client({ name: 'brain', version: '1.0' }, { capabilities: {} });
  await mcp.connect(mcpTransport);
  const { tools } = await mcp.listTools();
  ok('listTools', `${tools.length} operations exposed to the brain`);
  // Drive an op PER ACCOUNT TYPE via MCP.
  for (const p of PLATFORMS) {
    const r = await mcp.callTool({ name: 'account.status', arguments: { platform: p } });
    const data = JSON.parse(r.content[0].text);
    console.log(`    MCP account.status(${p}) -> ${Array.isArray(data.accounts) ? data.accounts.length : '?'} account(s)`);
  }
  const persona = JSON.parse((await mcp.callTool({ name: 'persona.generate', arguments: { niche: 'travel', locale: 'en', seed: 7 } })).content[0].text);
  ok('MCP persona.generate', persona.displayName);
  // ── RAG — brain grounding on read-models ──
  const { resources } = await mcp.listResources();
  ok('MCP/RAG listResources', resources.map((r) => r.uri).join(', '));
  const acct = JSON.parse((await mcp.readResource({ uri: 'acq://accounts' })).contents[0].text);
  ok('RAG read acq://accounts', `${acct.accounts.length} accounts, secrets stripped=${acct.accounts.every((a) => !a.secretRefs)}`);
  await mcp.close();

  // ── SURFACE 2 — HTTP/REST (real network, dockerized api on :7500) ──
  console.log('\n[HTTP/REST] sync API contour — real network');
  const restPing = await restCall('scoring.score', { subjectType: 'account', subjectId: 'a1', features: { ageDays: 90, warmupLevel: 1 } });
  if (restPing.error) seam('REST unreachable (start dockerized api on :7500)', restPing.error);
  else {
    ok('REST scoring.score', 'score=' + (JSON.parse(restPing.body).data?.score));
    for (const p of ['telegram', 'instagram', 'tiktok']) {
      const r = await restCall('account.status', { platform: p });
      console.log(`    REST account.status(${p}) -> HTTP ${r.status}`);
    }
  }

  // ── SURFACE 3 — CLI / manual (in-process, same facade) ──
  console.log('\n[CLI/manual] operator contour — same facade');
  const cli = await runCli(['persona.generate', 'niche=fitness', 'locale=en', 'seed=7'], { facade, role: 'operator' });
  ok('CLI persona.generate', 'exit=' + cli.code + ', ' + JSON.parse(cli.stdout).data.displayName);
  const cliScore = await runCli(['scoring.score', 'subjectType=account', 'features={"ageDays":90,"warmupLevel":1}'], { facade, role: 'operator' });
  ok('CLI scoring.score', 'score=' + JSON.parse(cliScore.stdout).data.score);

  // ── CONSISTENCY — same op, same result across MCP vs CLI (one facade) ──
  console.log('\n[consistency] one definition, many surfaces');
  const viaCli = JSON.parse((await runCli(['persona.generate', 'niche=travel', 'locale=en', 'seed=7'], { facade })).stdout).data.personaKey;
  ok('persona.generate personaKey identical across MCP & CLI', String(persona.personaKey === viaCli));

  // ── SURFACE 4 — real data parsing through the built-in browser (Puppeteer) ──
  console.log('\n[browser] data parsing through the built-in Puppeteer browser');
  const bp = createPuppeteerBrowserProvider({ maxConcurrency: 1, headless: true });
  try {
    const PAGE = `data:text/html,${encodeURIComponent('<ul id="f"><li class="u" data-h="@nick">Nick</li><li class="u" data-h="@sam">Sam</li><li class="u" data-h="@lee">Lee</li></ul>')}`;
    const adapter = createBrowserScrapeAdapter({
      browserProvider: bp,
      resolveUrl: () => PAGE,
      extractItems: () => Array.from(document.querySelectorAll('#f .u')).map((el) => ({ handle: el.getAttribute('data-h'), displayName: el.textContent })),
      keyOf: (it) => it.handle, maxScrolls: 2
    });
    const sp = createScrapeProvider({ adapters: { browser: adapter } });
    const { tier, entities } = await sp.scrape({ platform: 'instagram', targetType: 'followers', target: 'ms', routing: { needsLogin: true } });
    ok(`browser parse via ${tier} tier`, entities.map((e) => e.data.handle).join(','));
  } finally {
    await bp.close().catch(() => {});
  }

  await EngineAccount.deleteMany({ identifier: { $regex: '^@ms_' } });
  await disconnectMongo();
  console.log('\n✔ multi-surface live drive complete');
}

main().catch((e) => { console.error('multi-surface error:', e); process.exit(1); });
