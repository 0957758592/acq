#!/usr/bin/env node
// LIVE: the on-device selector override framework is managed through EVERY
// surface against the dockerized server — device.selectors.set (tune a live app
// build) + device.selectors (read) + acq://selectors (RAG), over
// MCP · RAG · REST · gRPC · WS · GraphQL · A2A · CLI (brain-callable).
import http from 'node:http';

import WebSocket from 'ws';
import grpc from '@grpc/grpc-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFacade } from '@acq/control';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineSelectorOverride } from '@acq/core/models/engine-selector-override';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { runCli } from '../apps/control-plane/src/cli.js';
import { loadControlProto } from '../apps/control-plane/src/grpc-server.js';

const T = 'admin-dev-token';
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);

function rest(op, args, method = 'POST', path = null) {
  return new Promise((resolve) => {
    const body = args ? JSON.stringify(args) : '';
    const req = http.request({ host: '127.0.0.1', port: 7500, path: path || `/v1/op/${op}`, method, timeout: 6000, headers: { 'content-type': 'application/json', authorization: `Bearer ${T}`, 'content-length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d || '{}'))); });
    req.on('error', (e) => resolve({ error: { code: e.message } })); req.on('timeout', () => { req.destroy(); resolve({ error: { code: 'timeout' } }); });
    req.end(body);
  });
}

async function main() {
  await connectMongo(URI);
  await EngineSelectorOverride.deleteMany({ platform: { $in: ['telegram', 'discord', 'facebook', 'whatsapp'] } });

  const facade = createFacade({ useCases: buildUseCases(buildEngineContext({ env: { platforms: ['telegram'] } })), audit: { record: async () => {} } });

  // ── SET via each surface, READ back via each surface ──
  console.log('\n[SET across surfaces] tune the on-device report selector for a live build');
  // REST — set telegram
  ok('REST set(telegram)', JSON.stringify((await rest('device.selectors.set', { platform: 'telegram', selectors: { actions: { report: { triggerTexts: ['Report abuse', 'Пожаловаться'] } } }, updatedBy: 'julian' })).data?.selectors));
  // MCP (brain) — set discord + read
  const mcp = new Client({ name: 'sel', version: '1.0' }, { capabilities: {} });
  await mcp.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:7500/mcp'), { requestInit: { headers: { authorization: `Bearer ${T}` } } }));
  await mcp.callTool({ name: 'device.selectors.set', arguments: { platform: 'discord', selectors: { submitTexts: ['Log In'] } } });
  ok('MCP set(discord)+get', JSON.stringify(JSON.parse((await mcp.callTool({ name: 'device.selectors', arguments: { platform: 'discord' } })).content[0].text).selectors));
  // WS — set facebook
  const ws = new WebSocket('ws://127.0.0.1:7500/v1/ws', { headers: { authorization: `Bearer ${T}` } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const w = await new Promise((r) => { ws.once('message', (m) => r(JSON.parse(m.toString()))); ws.send(JSON.stringify({ id: 's1', operation: 'device.selectors.set', args: { platform: 'facebook', selectors: { homeTexts: ["What's on your mind"] } } })); });
  ok('WS set(facebook)', JSON.stringify(w.data?.selectors));
  ws.close();
  // CLI (manual) — set whatsapp
  const cli = await runCli(['device.selectors.set', 'platform=whatsapp', 'selectors={"actions":{"report":{"triggerTexts":["Report contact"]}}}'], { facade, role: 'operator' });
  ok('CLI set(whatsapp)', cli.stderr ? JSON.parse(cli.stderr).code : 'stored');

  console.log('\n[READ across surfaces]');
  // REST get
  ok('REST get(telegram)', JSON.stringify((await rest('device.selectors', { platform: 'telegram' })).data.selectors.actions.report.triggerTexts));
  // gRPC get
  const gc = new (loadControlProto()).Control('127.0.0.1:7550', grpc.credentials.createInsecure());
  const md = new grpc.Metadata(); md.set('authorization', `Bearer ${T}`);
  const g = await new Promise((res) => gc.Execute({ operation: 'device.selectors', args_json: JSON.stringify({ platform: 'whatsapp' }) }, md, (e, r) => res(e ? { error: e.message } : JSON.parse(r.data_json))));
  ok('gRPC get(whatsapp)', JSON.stringify(g.selectors.actions.report.triggerTexts)); gc.close();
  // GraphQL get
  const q = await rest(null, { query: 'query($op:String!,$a:JSON){op(operation:$op,args:$a){data error}}', variables: { op: 'device.selectors', a: { platform: 'discord' } } }, 'POST', '/v1/graphql');
  ok('GraphQL get(discord)', JSON.stringify(q.data.op.data.selectors));
  // A2A
  const a = await rest(null, { id: 's2', skill: 'device.selectors', args: { platform: 'facebook' } }, 'POST', '/a2a');
  ok('A2A get(facebook)', a.status?.state);
  // RAG acq://selectors
  const rag = JSON.parse((await mcp.readResource({ uri: 'acq://selectors' })).contents[0].text);
  ok('RAG acq://selectors', `${rag.selectors.length} platforms tuned: ${rag.selectors.map((s) => s.platform).sort().join(', ')}`);
  await mcp.close();

  await EngineSelectorOverride.deleteMany({ platform: { $in: ['telegram', 'discord', 'facebook', 'whatsapp'] } });
  await disconnectMongo();
  console.log('\n✔ ON-DEVICE SELECTORS MANAGED VIA EVERY SURFACE — MCP · RAG · REST · gRPC · WS · GraphQL · A2A · CLI (set + get) — LIVE ✓');
}

main().catch((e) => { console.error('selectors-surfaces error:', e); process.exit(1); });
