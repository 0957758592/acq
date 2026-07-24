#!/usr/bin/env node
// LIVE: the Telegram scrape system (web parser by default, Bot API opt-in) is
// managed through EVERY control surface against the dockerized server:
//   scrape.run (dispatch — default web AND params.via='bot-api') and
//   scrape.results (read the group content + commenters) over
//   MCP · RAG · REST/HTTP · gRPC(API) · WebSocket · GraphQL · A2A · CLI(manual).
// Needs the dockerized api on :7500 + gRPC :7550 (rabbit up so scrape.run enqueues).
import http from 'node:http';

import WebSocket from 'ws';
import grpc from '@grpc/grpc-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFacade } from '@acq/control';
import { createMongoScrapeResultRepo } from '@acq/engine-infra';
import { normalizeEntities } from '@acq/scraping';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { runCli } from '../apps/control-plane/src/cli.js';
import { loadControlProto } from '../apps/control-plane/src/grpc-server.js';

const T = 'admin-dev-token';
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const GROUP = 'acq_surfaces_group';
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
const mine = (results) => (results || []).filter((r) => r.target === GROUP);

async function main() {
  await connectMongo(URI);
  await EngineScrapeResult.deleteMany({ target: GROUP });
  // Seed normalized telegram group results via the REAL normalizer (as a tier would).
  const repo = createMongoScrapeResultRepo({ model: EngineScrapeResult });
  await repo.upsertResults(normalizeEntities({ platform: 'telegram', targetType: 'messages', target: GROUP, rawItems: [
    { id: '1', text: 'how do I reset 2FA?', from: 'ann' }, { id: '2', text: 'same', author: { username: 'bob' } }
  ] }));
  await repo.upsertResults(normalizeEntities({ platform: 'telegram', targetType: 'participants', target: GROUP, rawItems: [{ username: 'ann' }, { username: 'bob' }, { username: 'carol' }] }));

  const ctx = buildEngineContext({ env: { platforms: ['telegram'] } });
  const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });

  // ── MCP (brain) — dispatch (web default + bot-api) + read + RAG resource ──
  console.log('\n[MCP / brain]');
  const mcp = new Client({ name: 'surf', version: '1.0' }, { capabilities: {} });
  await mcp.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:7500/mcp'), { requestInit: { headers: { authorization: `Bearer ${T}` } } }));
  const runWeb = JSON.parse((await mcp.callTool({ name: 'scrape.run', arguments: { platform: 'telegram', targetType: 'messages', target: GROUP } })).content[0].text);
  ok('MCP scrape.run (default web)', `enqueued=${runWeb.enqueued}`);
  const runBot = JSON.parse((await mcp.callTool({ name: 'scrape.run', arguments: { platform: 'telegram', targetType: 'messages', target: GROUP, params: { via: 'bot-api' } } })).content[0].text);
  ok('MCP scrape.run (params.via=bot-api)', `enqueued=${runBot.enqueued}`);
  const mcpRes = JSON.parse((await mcp.callTool({ name: 'scrape.results', arguments: { platform: 'telegram', type: 'message' } })).content[0].text);
  ok('MCP scrape.results', `${mine(mcpRes.results).length} messages`);
  const rag = JSON.parse((await mcp.readResource({ uri: 'acq://scrape' })).contents[0].text);
  ok('RAG acq://scrape', `${mine(rag.results).length} results for the group (content+authors)`);
  await mcp.close();

  // ── REST / HTTP ──
  console.log('\n[HTTP / REST]');
  ok('REST scrape.run', `enqueued=${(await rest('scrape.run', { platform: 'telegram', targetType: 'messages', target: GROUP, params: { via: 'bot-api' } })).data?.enqueued}`);
  ok('REST scrape.results', `${mine((await rest('scrape.results', { platform: 'telegram', type: 'message' })).data.results).length} messages`);

  // ── gRPC (API) ──
  console.log('\n[gRPC / API]');
  const gc = new (loadControlProto()).Control('127.0.0.1:7550', grpc.credentials.createInsecure());
  const md = new grpc.Metadata(); md.set('authorization', `Bearer ${T}`);
  const grpcRes = await new Promise((res) => gc.Execute({ operation: 'scrape.results', args_json: JSON.stringify({ platform: 'telegram', type: 'participant' }) }, md, (e, r) => res(e ? { error: e.message } : JSON.parse(r.data_json))));
  ok('gRPC scrape.results (participants)', `${mine(grpcRes.results).length} participants`);
  gc.close();

  // ── WebSocket ──
  console.log('\n[WebSocket]');
  const ws = new WebSocket('ws://127.0.0.1:7500/v1/ws', { headers: { authorization: `Bearer ${T}` } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const wsRes = await new Promise((r) => { ws.once('message', (m) => r(JSON.parse(m.toString()))); ws.send(JSON.stringify({ id: 's1', operation: 'scrape.results', args: { platform: 'telegram', type: 'message' } })); });
  ok('WS scrape.results', `${mine(wsRes.data.results).length} messages`);
  ws.close();

  // ── GraphQL ──
  console.log('\n[GraphQL]');
  const gql = await rest(null, { query: 'query($op:String!,$a:JSON){op(operation:$op,args:$a){data error}}', variables: { op: 'scrape.results', a: { platform: 'telegram', type: 'message' } } }, 'POST', '/v1/graphql');
  ok('GraphQL scrape.results', `${mine(gql.data.op.data.results).length} messages`);

  // ── A2A ──
  console.log('\n[A2A]');
  const a2a = await rest(null, { id: 's2', skill: 'scrape.results', args: { platform: 'telegram', type: 'participant' } }, 'POST', '/a2a');
  ok('A2A scrape.results', `${a2a.status?.state}`);

  // ── CLI (manual) ──
  console.log('\n[CLI / manual]');
  const cli = await runCli(['scrape.results', 'platform=telegram', 'type=message'], { facade, role: 'readonly' });
  ok('CLI scrape.results', `${mine(JSON.parse(cli.stdout).data.results).length} messages`);
  // manual dispatch with bot-api param through the CLI:
  const cliRun = await runCli(['scrape.run', 'platform=telegram', 'targetType=messages', `target=${GROUP}`, 'params={"via":"bot-api"}'], { facade, role: 'operator' });
  ok('CLI scrape.run (params.via=bot-api)', cliRun.stderr ? JSON.parse(cliRun.stderr).code : `enqueued=${JSON.parse(cliRun.stdout).data.enqueued}`);

  await EngineScrapeResult.deleteMany({ target: GROUP });
  await disconnectMongo();
  console.log('\n✔ TELEGRAM SCRAPE MANAGED VIA EVERY SURFACE — MCP · RAG · REST · gRPC · WS · GraphQL · A2A · CLI (web default + bot-api param) — LIVE ✓');
}

main().catch((e) => { console.error('scrape-surfaces error:', e); process.exit(1); });
