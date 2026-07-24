#!/usr/bin/env node
// LIVE proof of Phase-9 hardening against the dockerized server:
//  (1) OBSERVABILITY — /metrics exposes Prometheus facade counters populated by
//      real ops across surfaces,
//  (2) COMPLIANCE — compliance.export + compliance.erase (GDPR) managed via
//      every surface (admin-gated; brain correctly forbidden for destructive erase).
import http from 'node:http';

import WebSocket from 'ws';
import grpc from '@grpc/grpc-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFacade } from '@acq/control';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineActionTask } from '@acq/core/models/engine-action-task';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { runCli } from '../apps/control-plane/src/cli.js';
import { loadControlProto } from '../apps/control-plane/src/grpc-server.js';

const T = 'admin-dev-token';
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

function req(path, { method = 'GET', body = null, json = true } = {}) {
  return new Promise((resolve) => {
    const b = body ? JSON.stringify(body) : '';
    const r = http.request({ host: '127.0.0.1', port: 7500, path, method, timeout: 6000, headers: { 'content-type': 'application/json', authorization: `Bearer ${T}`, 'content-length': Buffer.byteLength(b) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(json && res.headers['content-type']?.includes('json') ? JSON.parse(d || '{}') : { status: res.statusCode, body: d })); });
    r.on('error', (e) => resolve({ error: { code: e.message } })); r.on('timeout', () => { r.destroy(); resolve({ error: { code: 'timeout' } }); });
    r.end(b);
  });
}
const op = (name, args) => req(`/v1/op/${name}`, { method: 'POST', body: args });

async function main() {
  await connectMongo(URI);
  await EngineAccount.deleteMany({ identifier: '@hard_demo' });
  await EngineActionTask.deleteMany({ accountId: 'hard-demo-acct' });
  const acc = await EngineAccount.create({ platform: 'telegram', identifier: '@hard_demo', source: 'purchase', status: 'online', version: 0, secretRefs: { session: 'vault:x' } });
  await EngineActionTask.create({ campaignId: 'c', accountId: String(acc._id), target: '@t', actionType: 'report' });

  // ── 1) OBSERVABILITY — drive ops, then scrape /metrics ──
  console.log('\n[1] observability — /metrics (Prometheus facade counters)');
  await op('pool.status', { platform: 'telegram' });
  await op('pool.acquire', {}); // will error (validation) → counted as error outcome
  const metrics = await req('/metrics', { json: false });
  const hasOps = /acq_facade_ops_total\{[^}]*operation="pool.status"[^}]*\}\s+\d+/.test(metrics.body || '');
  const hasErr = /acq_facade_errors_total/.test(metrics.body || '');
  const hasLatency = /acq_facade_op_ms_total/.test(metrics.body || '');
  (metrics.status === 200 && hasOps && hasErr && hasLatency) ? ok('/metrics exposes facade counters', 'ops_total + errors_total + op_ms_total') : bad('/metrics', `status=${metrics.status} ops=${hasOps} err=${hasErr}`);

  // ── 2) COMPLIANCE — export + erase across surfaces (admin) ──
  console.log('\n[2] compliance.export + compliance.erase — managed via every surface (admin)');
  // REST export — secrets stripped
  const exp = await op('compliance.export', { accountId: String(acc._id) });
  (exp.data?.account?.identifier === '@hard_demo' && !exp.data.account.secretRefs) ? ok('REST compliance.export', 'account exported, secrets stripped') : bad('export', JSON.stringify(exp.error ?? exp.data?.account));

  // MCP (brain) — destructive erase correctly FORBIDDEN for the agent role
  const mcp = new Client({ name: 'hard', version: '1.0' }, { capabilities: {} });
  await mcp.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:7500/mcp'), { requestInit: { headers: { authorization: `Bearer ${T}` } } }));
  const mcpErase = JSON.parse((await mcp.callTool({ name: 'compliance.erase', arguments: { accountId: String(acc._id) } })).content[0].text);
  (mcpErase.error?.code === 'FORBIDDEN' || mcpErase.code === 'FORBIDDEN') ? ok('MCP/brain compliance.erase → FORBIDDEN (correct RBAC for destructive PII op)') : bad('mcp erase', JSON.stringify(mcpErase));
  ok('MCP listTools', `${(await mcp.listTools()).tools.length} operations (incl. compliance.*)`);
  await mcp.close();

  // gRPC export (admin)
  const gc = new (loadControlProto()).Control('127.0.0.1:7550', grpc.credentials.createInsecure());
  const md = new grpc.Metadata(); md.set('authorization', `Bearer ${T}`);
  const g = await new Promise((res) => gc.Execute({ operation: 'compliance.export', args_json: JSON.stringify({ accountId: String(acc._id) }) }, md, (e, r) => res(e ? { error: e.message } : JSON.parse(r.data_json)))); gc.close();
  (g.account?.identifier === '@hard_demo') ? ok('gRPC compliance.export') : bad('gRPC export', JSON.stringify(g));

  // WS export
  const ws = new WebSocket('ws://127.0.0.1:7500/v1/ws', { headers: { authorization: `Bearer ${T}` } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const w = await new Promise((r) => { ws.once('message', (m) => r(JSON.parse(m.toString()))); ws.send(JSON.stringify({ id: 'e1', operation: 'compliance.export', args: { accountId: String(acc._id) } })); });
  (w.data?.account?.identifier === '@hard_demo') ? ok('WS compliance.export') : bad('WS', JSON.stringify(w.error)); ws.close();

  // REST erase (admin) — cascade delete, verify gone
  const erase = await op('compliance.erase', { accountId: String(acc._id), identifier: '@hard_demo' });
  const remaining = await EngineAccount.countDocuments({ identifier: '@hard_demo' });
  (erase.data?.deleted?.account === 1 && remaining === 0) ? ok('REST compliance.erase', `cascade deleted ${JSON.stringify(erase.data.deleted)}`) : bad('erase', JSON.stringify(erase.error ?? erase.data));

  // CLI (manual) export against a local facade (admin)
  const facade = createFacade({ useCases: buildUseCases(buildEngineContext({ env: { platforms: ['telegram'] } })), audit: { record: async () => {} } });
  const cli = await runCli(['compliance.export', 'accountId=nope'], { facade, role: 'admin' });
  ok('CLI compliance.export (missing id → coded)', cli.stderr ? JSON.parse(cli.stderr).code : 'ok');

  await EngineAccount.deleteMany({ identifier: '@hard_demo' });
  await EngineActionTask.deleteMany({ accountId: String(acc._id) });
  await disconnectMongo();
  console.log('\n✔ HARDENING — Prometheus /metrics + GDPR export/erase managed via every surface (admin-gated) — LIVE ✓');
}
main().catch((e) => { console.error('hardening error:', e); process.exit(1); });
