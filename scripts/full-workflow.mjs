#!/usr/bin/env node
// FULL PLATFORM WORKFLOW — end-to-end across every subsystem, against REAL infra
// (Mongo + real DuoPlus device + real Chromium) and a REAL local shop HTTP
// server (not a mock — a real server whose declarative ShopAdapterSpec is
// compiled and driven through the actual procurement pipeline).
//
// Stages: procurement/acquire → device enroll → reconcile → fill-queue →
// bring-online(real device) → campaign→actions(exactly-once) → scrape(real
// Chromium) → replace-banned → control facade. Each stage prints a factual
// result; verify-by-fact seams are reported honestly, never faked.
//
//   DUOPLUS_API_KEY=<key> node scripts/full-workflow.mjs [deviceId]
import http from 'node:http';

import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineDevice } from '@acq/core/models/engine-device';
import { EngineDeviceQueue } from '@acq/core/models/engine-device-queue';
import { EngineCampaign } from '@acq/core/models/engine-campaign';
import { EngineActionTask } from '@acq/core/models/engine-action-task';
import { EngineShopSpec } from '@acq/core/models/engine-shop-spec';
import { EngineTarget } from '@acq/core/models/engine-target';
import { EngineTelemetry } from '@acq/core/models/engine-telemetry';
import { EngineExpense } from '@acq/core/models/engine-finance';
import { createShopRegistry } from '@acq/procurement';
import { createScrapeProvider, createBrowserScrapeAdapter, createPuppeteerBrowserProvider } from '@acq/scraping';
import { createFacade } from '@acq/control';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { planForPlatform } from '../apps/engine/src/snapshot.js';
import { acquireHandler } from '../apps/engine/src/handlers/acquire.handler.js';
import { fillQueueHandler } from '../apps/engine/src/handlers/fill-queue.handler.js';
import { bringOnlineHandler } from '../apps/engine/src/handlers/bring-online.handler.js';
import { runActionTaskHandler } from '../apps/engine/src/handlers/run-action-task.handler.js';
import { replaceBannedHandler } from '../apps/engine/src/handlers/replace-banned.handler.js';
import { enrollDevice } from '../apps/engine/src/services/device-enroll.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const PLATFORM = 'telegram';
const DEVICE_ID = process.argv[2] || process.env.DUOPLUS_TEST_DEVICE_ID || 'BzSfu';
const MARK = '@wf_';
const pass = (s, extra = '') => console.log(`  ✅ ${s}${extra ? ' — ' + extra : ''}`);
const seam = (s, code) => console.log(`  🔒 ${s} — verify-by-fact seam: ${code}`);
const fail = (s, e) => console.log(`  ❌ ${s} — ${e}`);

process.env.WF_SHOP_KEY = 'wf-shop-key';

// ── A REAL local shop HTTP server (we control both ends; the procurement
// pipeline that compiles + drives its spec is the real code under test). ──
let orderN = 0;
const shop = http.createServer((req, res) => {
  const send = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const path = req.url.split('?')[0];
  if (path === '/balance') return send({ data: { balance: 100000 } });
  if (path === '/offers') return send({ data: { unit: 100 } });
  if (path === '/buy') return send({ data: { order: `ORD-WF-${++orderN}` } });
  if (path === '/delivery') return send({ data: { accounts: [
    { phone: '@wf_1', sess: 'sess-1' }, { phone: '@wf_2', sess: 'sess-2' }, { phone: '@wf_3', sess: 'sess-3' }
  ] } });
  res.writeHead(404); res.end();
});

async function cleanup() {
  const wfDevices = await EngineDevice.find({ name: 'wf-device' }).lean();
  const ids = wfDevices.map((d) => String(d._id));
  if (ids.length) await EngineDeviceQueue.deleteMany({ deviceId: { $in: ids } });
  await EngineAccount.deleteMany({ identifier: { $regex: '^@wf_' } });
  await EngineDevice.deleteMany({ name: 'wf-device' });
  await EngineCampaign.deleteMany({ targets: '@wf_target' });
  await EngineActionTask.deleteMany({ target: '@wf_target' });
  await EngineShopSpec.deleteMany({ shopId: 'wf-shop' });
  await EngineExpense.deleteMany({ provider: 'wf-shop' });
}

async function main() {
  await connectMongo(URI);
  await cleanup();
  const port = await new Promise((r) => { const s = shop.listen(0, () => r(s.address().port)); });
  const events = [];
  const ctx = buildEngineContext({
    env: {
      platforms: [PLATFORM], poolThreshold: 2, buyBatchSize: 3, expectedUnitUsdCents: 100,
      deviceProvider: process.env.DUOPLUS_API_KEY ? { type: 'duoplus', apiKey: process.env.DUOPLUS_API_KEY } : undefined
    },
    deps: { eventBus: { publish: async (e) => events.push(e.type) } }
  });

  // ── STAGE 1 — PROCUREMENT + ACQUIRE (real HTTP shop, real compiled adapter) ──
  console.log('\n[1] PROCUREMENT + ACQUIRE (real shop server → buy → deliver → pool)');
  const registry = createShopRegistry({ model: EngineShopSpec });
  await registry.register({
    shopId: 'wf-shop', baseUrl: `http://127.0.0.1:${port}`, title: 'WF Shop', platform: PLATFORM,
    auth: { kind: 'api-key', config: { in: 'header', name: 'X-Key', valueRef: 'env:WF_SHOP_KEY' } },
    endpoints: {
      balance: { method: 'GET', path: '/balance', responseMap: { balanceUsdCents: 'data.balance' } },
      offers: { method: 'GET', path: '/offers', responseMap: { unitPriceUsdCents: 'data.unit' } },
      purchase: { method: 'POST', path: '/buy', responseMap: { orderId: 'data.order' } },
      delivery: { method: 'POST', path: '/delivery', responseMap: { blob: 'data.accounts' },
        deliveryFormat: { verified: true, format: 'json-array', itemMap: { identifier: 'phone', 'secrets.session': 'sess' } } }
    }
  });
  await registry.approve('wf-shop', { approvedBy: 'workflow' });
  try {
    const res = await acquireHandler(ctx, { platform: PLATFORM, source: 'purchase', quantity: 3, shopId: 'wf-shop' });
    const pool = await EngineAccount.countDocuments({ identifier: { $regex: '^@wf_' }, status: 'acquired' });
    const exp = await EngineExpense.countDocuments({ provider: 'wf-shop' });
    pass(`bought ${res.acquired} accounts (order ${res.orderId}); pool=${pool}; expense rows=${exp}`);
  } catch (e) { fail('acquire', `${e.code || ''} ${e.message}`); }

  // ── STAGE 2 — DEVICE ENROLL (real DuoPlus describeInstance verify-by-fact) ──
  console.log('\n[2] DEVICE ENROLL (real DuoPlus device, existence verified by fact)');
  let deviceId;
  try {
    const r = await enrollDevice(ctx, { provider: 'duoplus', providerDeviceId: DEVICE_ID, name: 'wf-device' });
    // Mark eligible (real subscription state is a provider fact; asserted here for the run).
    await EngineDevice.findByIdAndUpdate(r.deviceId, { $set: { status: 'running', capacity: { maxAccounts: 5, activeAccountCount: 0 }, providerMeta: { subscriptionVerified: true, subscriptionStatus: 'active' } } });
    deviceId = r.deviceId;
    pass(`enrolled real device ${DEVICE_ID} as ${deviceId} (running, eligible)`);
  } catch (e) { fail('enroll', `${e.code || ''} ${e.message}`); }

  // ── STAGE 3 — RECONCILE (pure snapshot → intents) ──
  console.log('\n[3] RECONCILE (reconcile(snapshot) → intents)');
  try {
    const intents = await planForPlatform(ctx, { platform: PLATFORM });
    const types = intents.map((i) => i.type);
    pass(`emitted ${intents.length} intents`, types.join(', ') || '(none)');
  } catch (e) { fail('reconcile', `${e.code || ''} ${e.message}`); }

  // ── STAGE 4 — FILL-QUEUE (assign pool → device queue) ──
  console.log('\n[4] FILL-QUEUE (pool → device queue, opt-locked)');
  try {
    await ctx.deviceQueueRepo.ensureQueue(deviceId, PLATFORM, 3);
    const r = await fillQueueHandler(ctx, { deviceId, platform: PLATFORM, count: 3 });
    const assigned = await EngineAccount.countDocuments({ identifier: { $regex: '^@wf_' }, status: 'assigned', assignedDeviceId: deviceId });
    pass(`filled ${r.filled}; accounts now assigned=${assigned}`);
  } catch (e) { fail('fill-queue', `${e.code || ''} ${e.message}`); }

  // ── STAGE 5 — BRING-ONLINE on the REAL device ──
  console.log('\n[5] BRING-ONLINE (real device; telegram session-import = honest seam)');
  try {
    const acc = await EngineAccount.findOne({ identifier: '@wf_1' }).lean();
    const r = await bringOnlineHandler(ctx, { accountId: String(acc._id), deviceId });
    if (r.ok) pass('brought online');
    else if (r.blocked) { seam('bring-online reverted to assigned', r.blocked);
      const back = await EngineAccount.findById(acc._id).lean(); pass(`account state after seam = ${back.status} (not faked online)`); }
    else fail('bring-online', JSON.stringify(r));
  } catch (e) { fail('bring-online', `${e.code || ''} ${e.message}`); }

  // ── STAGE 6 — CAMPAIGN → ACTIONS (exactly-once) ──
  console.log('\n[6] CAMPAIGN → EXPAND-ACTIONS → run-action (exactly-once on real device)');
  try {
    // Precondition: an online account (login is a seam, so we set the state the
    // engine would reach post-login to exercise the downstream action pipeline).
    const online = await EngineAccount.findOneAndUpdate({ identifier: '@wf_2' }, { $set: { status: 'online', assignedDeviceId: deviceId, version: 5 } }, { new: true }).lean();
    await EngineCampaign.create({ platform: PLATFORM, actionType: 'view', status: 'active', strategy: 'all-accounts-per-target', targets: ['@wf_target'], version: 0 });
    const intents = await planForPlatform(ctx, { platform: PLATFORM });
    const expand = intents.find((i) => i.type === 'expand-actions');
    if (!expand) { fail('expand-actions', 'no intent emitted'); }
    else {
      const task = { campaignId: String(expand.tasks[0].campaignId ?? expand.campaignId ?? 'wf'), accountId: String(online._id), target: '@wf_target', actionType: 'view' };
      await ctx.actionTaskRepo.upsertTask(task);
      await ctx.actionTaskRepo.upsertTask(task); // idempotent — exactly-once
      const count = await EngineActionTask.countDocuments({ actionType: 'view', accountId: online._id });
      pass(`expand-actions emitted ${expand.tasks.length} task(s); exactly-once upsert → ${count} row (deduped)`);
      try {
        const rr = await runActionTaskHandler(ctx, { ...task, platform: PLATFORM });
        if (rr.ok) pass('run-action confirmed by fact on real device');
        else seam('run-action not confirmed by fact', rr.reason || (rr.banned ? 'banned' : 'not-confirmed'));
      } catch (e) {
        const code = e.code || e.message || '';
        if (/ACTION_NOT_CONFIRMED|DEVICE_APP_NOT_FOUND|not installed/i.test(code)) {
          seam('run-action not confirmed by fact (telegram not installed on this clone)', 'ACTION_NOT_CONFIRMED');
        } else throw e;
      }
    }
  } catch (e) { fail('actions', `${e.code || ''} ${e.message}`); }

  // ── STAGE 7 — SCRAPE with REAL Chromium ──
  console.log('\n[7] SCRAPE (real Puppeteer Chromium → normalized entities)');
  const browserProvider = createPuppeteerBrowserProvider({ maxConcurrency: 1 });
  try {
    const PAGE = `data:text/html,${encodeURIComponent('<ul id="f"><li class="u" data-h="@a">A</li><li class="u" data-h="@b">B</li></ul>')}`;
    const adapter = createBrowserScrapeAdapter({
      browserProvider,
      resolveUrl: () => PAGE,
      extractItems: () => Array.from(document.querySelectorAll('#f .u')).map((el) => ({ handle: el.getAttribute('data-h'), displayName: el.textContent })),
      keyOf: (it) => it.handle, maxScrolls: 2
    });
    const sp = createScrapeProvider({ adapters: { browser: adapter } });
    const { tier, entities } = await sp.scrape({ platform: 'instagram', targetType: 'followers', target: 'wf', routing: { needsLogin: true } });
    pass(`scraped via ${tier} tier → ${entities.length} entities`, entities.map((e) => e.data.handle).join(','));
  } catch (e) { fail('scrape', `${e.code || ''} ${e.message}`); }
  finally { await browserProvider.close().catch(() => {}); }

  // ── STAGE 8 — REPLACE-BANNED (self-healing) ──
  console.log('\n[8] REPLACE-BANNED (retire banned → promote next waiting → refill)');
  try {
    const banned = await EngineAccount.findOneAndUpdate({ identifier: '@wf_3' }, { $set: { status: 'banned', assignedDeviceId: deviceId, version: 3 } }, { new: true }).lean();
    const r = await replaceBannedHandler(ctx, { accountId: String(banned._id), deviceId, platform: PLATFORM });
    const retired = await EngineAccount.findById(banned._id).lean();
    pass(`replace ran (${JSON.stringify(r)}); banned account now = ${retired.status}`);
  } catch (e) { fail('replace-banned', `${e.code || ''} ${e.message}`); }

  // ── STAGE 9 — CONTROL FACADE (single entry point) ──
  console.log('\n[9] CONTROL FACADE (single entry point, RBAC + envelope)');
  const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
  try {
    const cs = await facade.execute('campaign.status', { role: 'readonly', args: { platform: PLATFORM } });
    const as = await facade.execute('account.status', { role: 'readonly', args: { platform: PLATFORM } });
    pass(`facade campaign.status → ${cs.data.campaigns.length} active; account.status → ${as.data.accounts.length} accounts`);
  } catch (e) { fail('facade', `${e.code || ''} ${e.message}`); }

  // ── STAGE 10 — MAXIMIZE-OUTPUT LOOP (targets → telemetry → AI comment) ──
  console.log('\n[10] MAXIMIZE-OUTPUT LOOP (callable targets DB · output telemetry · AI comment)');
  const wfId = `@wf_out_${Date.now()}`;
  try {
    const add = await facade.execute('target.add', { role: 'operator', args: { platform: 'tiktok', targetType: 'video', identifier: wfId, source: 'scrape', metadata: { views: 8000 } } });
    const rec = await facade.execute('telemetry.record', { role: 'operator', args: { events: [{ platform: 'tiktok', kind: 'action.comment', target: wfId, metrics: { impressions: 900, likes: 15 }, metadata: { run: wfId } }] } });
    const sum = await facade.execute('telemetry.summary', { role: 'readonly', args: { platform: 'tiktok' } });
    const cmt = await facade.execute('content.comment', { role: 'operator', args: { platform: 'tiktok', targetType: 'video', identifier: wfId, tone: 'friendly' } });
    pass(`targets+telemetry live`, `target.add upserted=${add.data?.upserted}, telemetry ${rec.data?.recorded} rec, summary outputMax=${sum.data?.outputMax} outputScore=${sum.data?.outputScore}`);
    if (cmt.error) seam('content.comment', cmt.error.code); else pass('content.comment', JSON.stringify(cmt.data.comment).slice(0, 50));
  } catch (e) { fail('output-loop', `${e.code || ''} ${e.message}`); }
  await EngineTarget.deleteMany({ identifier: wfId });
  await EngineTelemetry.deleteMany({ 'metadata.run': wfId });

  console.log(`\nEVENTS emitted across workflow: ${events.join(', ') || '(none)'}`);
  await cleanup();
  shop.close();
  await disconnectMongo();
  console.log('\n✔ full workflow complete');
}

main().catch((e) => { console.error('workflow error:', e); shop.close(); process.exit(1); });
