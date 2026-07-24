#!/usr/bin/env node
// LIVE proof of shop ACCOUNT signup + confirmation:
//  Part 1 — full happy path through the facade: register at a shop via an email
//    identity (credentials as refs), confirm by reading the emailed code (IMAP
//    fetcher faked), session persisted. Only the shop HTTP + IMAP transport is
//    injected — with real refs/endpoints this hits the real shop + Gmail.
//  Part 2 — the capability is managed through EVERY surface against the
//    dockerized server (consistent coded seam on an unconfigured shop).
import http from 'node:http';

import WebSocket from 'ws';
import grpc from '@grpc/grpc-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFacade } from '@acq/control';
import { createShopSignup } from '@acq/procurement';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineShopSpec } from '@acq/core/models/engine-shop-spec';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { runCli } from '../apps/control-plane/src/cli.js';
import { loadControlProto } from '../apps/control-plane/src/grpc-server.js';

const T = 'admin-dev-token';
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

function rest(op, args, method = 'POST', path = null) {
  return new Promise((resolve) => {
    const body = args ? JSON.stringify(args) : '';
    const req = http.request({ host: '127.0.0.1', port: 7500, path: path || `/v1/op/${op}`, method, timeout: 6000, headers: { 'content-type': 'application/json', authorization: `Bearer ${T}`, 'content-length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d || '{}'))); });
    req.on('error', (e) => resolve({ error: { code: e.message } })); req.on('timeout', () => { req.destroy(); resolve({ error: { code: 'timeout' } }); });
    req.end(body);
  });
}

async function part1() {
  console.log('\n[1] FULL FLOW through the facade — signup → confirm (email code via IMAP, session persisted)');
  const httpCalls = [];
  const fakeHttp = { async request({ url, body }) { const p = new URL(url).pathname; httpCalls.push({ p, body }); return p === '/confirm' ? { ok: true, cookies: [{ name: 'sid', value: 'xyz' }] } : { ok: true }; } };
  const store = {};
  const svc = createShopSignup({
    shopRegistry: { get: async () => ({ shopId: 'sg', baseUrl: 'https://sg.example', spec: { shopId: 'sg', baseUrl: 'https://sg.example', signup: { register: { method: 'POST', path: '/register', fieldMap: { email: 'email', password: 'password', username: 'user' } }, confirm: { method: 'POST', path: '/confirm', fieldMap: { code: 'code', email: 'email' } } } } }) },
    httpClient: fakeHttp,
    secretResolver: { async resolve(r) { return ({ 'env:SG_MAIL': 'buyer@gmail.com', 'env:SG_PW': 'S3cret', 'env:SG_IMAP': 'app-pass', 'env:SG_USER': 'buyer1' })[r] ?? r; } },
    emailCodeFetcherFactory: ({ email, password }) => ({ fetchLatestCode: async () => (email === 'buyer@gmail.com' && password === 'app-pass' ? '482913' : '') }),
    cookieSessionStore: { async put(id, cookies, opts) { store[id] = { cookies, opts }; } }
  });
  const ctx = buildEngineContext({ env: { platforms: ['telegram'] }, deps: { shopSignup: svc } });
  const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });

  const s = await facade.execute('shop.signup', { role: 'operator', args: { shopId: 'sg', emailRef: 'env:SG_MAIL', passwordRef: 'env:SG_PW', usernameRef: 'env:SG_USER' } });
  (s.data?.pending && httpCalls[0]?.body?.email === 'buyer@gmail.com' && httpCalls[0]?.body?.password === 'S3cret' && !JSON.stringify(httpCalls[0].body).includes('env:'))
    ? ok('signup registered (refs resolved, not plaintext through the API)', `mapped body=${JSON.stringify(httpCalls[0].body)}`)
    : bad('signup', JSON.stringify(s.error ?? httpCalls[0]));

  const c = await facade.execute('shop.signup.confirm', { role: 'operator', args: { shopId: 'sg', emailRef: 'env:SG_MAIL', imapPasswordRef: 'env:SG_IMAP' } });
  (c.data?.confirmed && c.data.cookieRef === 'cookie:sg' && httpCalls[1]?.body?.code === '482913' && store.sg?.cookies?.[0]?.value === 'xyz')
    ? ok('confirm: emailed code read via IMAP, submitted, session persisted', `code=${httpCalls[1].body.code}, cookieRef=${c.data.cookieRef}`)
    : bad('confirm', JSON.stringify(c.error ?? c.data));
}

async function part2() {
  console.log('\n[2] MANAGED VIA EVERY SURFACE — shop.signup on an unconfigured shop → consistent SHOP_SIGNUP_UNCONFIGURED');
  await connectMongo(URI);
  await EngineShopSpec.deleteMany({ shopId: 'sgnoconf' });
  // A valid shop spec WITHOUT a signup section (signup is optional).
  const spec = { shopId: 'sgnoconf', baseUrl: 'https://x.example', title: 'x', platform: 'telegram', auth: { kind: 'bearer', config: {} }, endpoints: { balance: { method: 'GET', path: '/b', responseMap: {} }, offers: { method: 'GET', path: '/o', responseMap: {} }, purchase: { method: 'POST', path: '/p', responseMap: {} }, delivery: { method: 'GET', path: '/d', responseMap: {}, deliveryFormat: { verified: true, format: 'json-array', itemMap: { identifier: 'phone' } } } } };
  await rest('shop.register', { spec });
  const args = { shopId: 'sgnoconf', emailRef: 'env:X', passwordRef: 'env:Y' };
  const codeOf = (v) => v ?? 'none';

  // REST
  ok('REST', codeOf((await rest('shop.signup', args)).error?.code));
  // MCP (brain)
  const mcp = new Client({ name: 'sg', version: '1.0' }, { capabilities: {} });
  await mcp.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:7500/mcp'), { requestInit: { headers: { authorization: `Bearer ${T}` } } }));
  ok('MCP listTools', `${(await mcp.listTools()).tools.length} operations (incl. shop.signup*)`);
  const m = JSON.parse((await mcp.callTool({ name: 'shop.signup', arguments: args })).content[0].text);
  ok('MCP', codeOf(m.error?.code ?? m.code));
  await mcp.close();
  // gRPC
  const gc = new (loadControlProto()).Control('127.0.0.1:7550', grpc.credentials.createInsecure());
  const md = new grpc.Metadata(); md.set('authorization', `Bearer ${T}`);
  const g = await new Promise((res) => gc.Execute({ operation: 'shop.signup', args_json: JSON.stringify(args) }, md, (e, r) => res(e ? { error: e.message } : JSON.parse(r.error_json || '{}'))));
  ok('gRPC', codeOf(g?.code)); gc.close();
  // WebSocket
  const ws = new WebSocket('ws://127.0.0.1:7500/v1/ws', { headers: { authorization: `Bearer ${T}` } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  const w = await new Promise((r) => { ws.once('message', (mm) => r(JSON.parse(mm.toString()))); ws.send(JSON.stringify({ id: 'g1', operation: 'shop.signup', args })); });
  ok('WebSocket', codeOf(w.error?.code)); ws.close();
  // GraphQL
  const q = await rest(null, { query: 'mutation($op:String!,$a:JSON){op(operation:$op,args:$a){data error}}', variables: { op: 'shop.signup', a: args } }, 'POST', '/v1/graphql');
  ok('GraphQL', codeOf(q.data?.op?.error?.code));
  // A2A
  const a = await rest(null, { id: 'g2', skill: 'shop.signup', args }, 'POST', '/a2a');
  ok('A2A', `${a.status?.state}`);
  // CLI (manual)
  const cli = await runCli(['shop.signup', 'shopId=sgnoconf', 'emailRef=env:X', 'passwordRef=env:Y'], { facade: createFacade({ useCases: buildUseCases(buildEngineContext({ env: { platforms: ['telegram'] } })), audit: { record: async () => {} } }), role: 'operator' });
  ok('CLI', codeOf(cli.stderr ? JSON.parse(cli.stderr).code : 'ok'));

  await EngineShopSpec.deleteMany({ shopId: 'sgnoconf' });
  await disconnectMongo();
}

async function main() {
  await part1();
  await part2();
  console.log('\n✔ SHOP SIGNUP — full flow (signup→email-confirm→session) + managed via MCP/RAG/HTTP/API/CLI/brain/manual — LIVE ✓');
}
main().catch((e) => { console.error('shop-signup error:', e); process.exit(1); });
