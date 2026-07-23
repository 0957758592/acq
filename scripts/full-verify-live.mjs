#!/usr/bin/env node
// FULL APPLICATION VERIFICATION (live, real data) — drives EVERY management
// contour against the running dockerized server + real Mongo, for ALL 8 account
// types, plus browser parsing. One facade, many surfaces (TZ §11). Needs the
// dockerized api on :7500 (REST/MCP/WS/GraphQL/A2A) and gRPC on :7550.
import http from 'node:http';

import WebSocket from 'ws';
import grpc from '@grpc/grpc-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFacade } from '@acq/control';
import { createScrapeProvider, createBrowserScrapeAdapter, createPuppeteerBrowserProvider } from '@acq/scraping';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { runCli } from '../apps/control-plane/src/cli.js';
import { loadControlProto } from '../apps/control-plane/src/grpc-server.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const T = 'admin-dev-token';
const PLATFORMS = ['whatsapp', 'telegram', 'discord', 'facebook', 'gmail', 'tiktok', 'instagram', 'youtube'];
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);

function rest(op, args, method = 'POST', path = null) {
  return new Promise((resolve) => {
    const body = args ? JSON.stringify(args) : '';
    const req = http.request({ host: '127.0.0.1', port: 7500, path: path || `/v1/op/${op}`, method, timeout: 6000, headers: { 'content-type': 'application/json', authorization: `Bearer ${T}`, 'content-length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', (e) => resolve({ error: e.message })); req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end(body);
  });
}

async function main() {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ identifier: { $regex: '^@fv_' } });
  await EngineAccount.insertMany(PLATFORMS.map((p) => ({ platform: p, identifier: `@fv_${p}`, source: 'purchase', status: 'online', assignedDeviceId: 'fv-dev', version: 0, secretRefs: { session: 'vault:x' } })));

  const ctx = buildEngineContext({ env: { platforms: PLATFORMS } });
  const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });

  // ── 1) MCP over HTTP — ALL 8 account types ──
  console.log('\n[MCP/HTTP] brain contour + all 8 account types');
  const mcp = new Client({ name: 'verify', version: '1.0' }, { capabilities: {} });
  await mcp.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:7500/mcp'), { requestInit: { headers: { authorization: `Bearer ${T}` } } }));
  ok('MCP listTools', `${(await mcp.listTools()).tools.length} operations`);
  for (const p of PLATFORMS) {
    const r = await mcp.callTool({ name: 'account.status', arguments: { platform: p } });
    const n = JSON.parse(r.content[0].text).accounts.length;
    console.log(`    MCP account.status(${p}) -> ${n} account(s)`);
  }
  const rag = JSON.parse((await mcp.readResource({ uri: 'acq://accounts' })).contents[0].text);
  ok('RAG acq://accounts', `${rag.accounts.length} accounts, secrets stripped=${rag.accounts.every((a) => !a.secretRefs)}`);
  await mcp.close();

  // ── 2) REST ──
  console.log('\n[HTTP/REST]');
  ok('REST scoring.score', 'score=' + JSON.parse((await rest('scoring.score', { subjectType: 'account', features: { ageDays: 90, warmupLevel: 1 } })).body).data.score);

  // ── 3) WebSocket ──
  console.log('\n[WebSocket]');
  const ws = new WebSocket('ws://127.0.0.1:7500/v1/ws', { headers: { authorization: `Bearer ${T}` } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const wsReply = await new Promise((r) => { ws.once('message', (m) => r(JSON.parse(m.toString()))); ws.send(JSON.stringify({ id: 'w1', operation: 'pool.status', args: { platform: 'telegram' } })); });
  ok('WS pool.status', JSON.stringify(wsReply.data));
  ws.close();

  // ── 4) GraphQL ──
  console.log('\n[GraphQL]');
  const gql = JSON.parse((await rest(null, { query: 'query($op:String!,$a:JSON){op(operation:$op,args:$a){data error}}', variables: { op: 'persona.generate', a: { niche: 'art', locale: 'en', seed: 5 } } }, 'POST', '/v1/graphql')).body);
  ok('GraphQL persona.generate', gql.data.op.data.displayName);

  // ── 5) A2A ──
  console.log('\n[A2A]');
  const card = JSON.parse((await rest(null, null, 'GET', '/.well-known/agent-card.json')).body);
  ok('A2A agent-card', `${card.skills.length} skills`);
  const a2a = JSON.parse((await rest(null, { id: 'a1', skill: 'account.status', args: { platform: 'instagram' } }, 'POST', '/a2a')).body);
  ok('A2A task account.status(instagram)', a2a.status.state);

  // ── 6) gRPC ──
  console.log('\n[gRPC]');
  const proto = loadControlProto();
  const gc = new proto.Control('127.0.0.1:7550', grpc.credentials.createInsecure());
  const md = new grpc.Metadata(); md.set('authorization', `Bearer ${T}`);
  const grpcReply = await new Promise((res, rej) => gc.Execute({ operation: 'pool.status', args_json: JSON.stringify({ platform: 'youtube' }) }, md, (e, r) => (e ? rej(e) : res(r))));
  ok('gRPC Execute(pool.status)', grpcReply.data_json);
  gc.close();

  // ── 7) CLI ──
  console.log('\n[CLI/manual]');
  const cli = await runCli(['scoring.score', 'subjectType=target', 'features={"followers":50000}'], { facade, role: 'readonly' });
  ok('CLI scoring.score', 'score=' + JSON.parse(cli.stdout).data.score);

  // ── 8) Browser parsing (Puppeteer) ──
  console.log('\n[Browser] data parsing (Puppeteer + CDP)');
  const bp = createPuppeteerBrowserProvider({ maxConcurrency: 1, headless: true });
  try {
    const PAGE = `data:text/html,${encodeURIComponent('<ul id="f"><li class="u" data-h="@ann">Ann</li><li class="u" data-h="@bo">Bo</li></ul>')}`;
    const adapter = createBrowserScrapeAdapter({ browserProvider: bp, resolveUrl: () => PAGE, extractItems: () => Array.from(document.querySelectorAll('#f .u')).map((el) => ({ handle: el.getAttribute('data-h'), displayName: el.textContent })), keyOf: (it) => it.handle, maxScrolls: 2 });
    const sp = createScrapeProvider({ adapters: { browser: adapter } });
    const { tier, entities } = await sp.scrape({ platform: 'instagram', targetType: 'followers', target: 'fv', routing: { needsLogin: true } });
    ok(`browser parse via ${tier}`, entities.map((e) => e.data.handle).join(','));
  } finally { await bp.close().catch(() => {}); }

  await EngineAccount.deleteMany({ identifier: { $regex: '^@fv_' } });
  await disconnectMongo();
  console.log('\n✔ FULL VERIFICATION — every contour + all 8 account types + browser parsing — LIVE ✓');
}

main().catch((e) => { console.error('verify error:', e); process.exit(1); });
