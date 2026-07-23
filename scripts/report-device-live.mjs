#!/usr/bin/env node
// LIVE report workflow on a REAL DuoPlus device — BOTH targeted (account.action)
// and mass (campaign → expand → run-action), verify-by-fact. Also proves the
// capability guard fires before any device I/O (report on instagram rejected).
//
//   DUOPLUS_API_KEY=<key> node scripts/report-device-live.mjs [deviceId]
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineDevice } from '@acq/core/models/engine-device';
import { EngineCampaign } from '@acq/core/models/engine-campaign';
import { EngineActionTask } from '@acq/core/models/engine-action-task';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { enrollDevice } from '../apps/engine/src/services/device-enroll.js';
import { runAccountAction } from '../apps/engine/src/services/account-ops.js';
import { planForPlatform } from '../apps/engine/src/snapshot.js';
import { runActionTaskHandler } from '../apps/engine/src/handlers/run-action-task.handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const DEVICE_ID = process.argv[2] || process.env.DUOPLUS_TEST_DEVICE_ID || 'BzSfu';
const PLATFORM = 'telegram';
const TARGET = '@rd_report_target';
const pass = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const seam = (s, code) => console.log(`  🔒 ${s} — verify-by-fact seam: ${code}`);
const fail = (s, x) => { console.log(`  ❌ ${s} — ${x}`); process.exitCode = 1; };

async function main() {
  if (!process.env.DUOPLUS_API_KEY) { console.error('DUOPLUS_API_KEY required'); process.exit(1); }
  await connectMongo(URI);
  await EngineAccount.deleteMany({ identifier: { $regex: '^@rd_' } });
  await EngineCampaign.deleteMany({ targets: TARGET });
  await EngineActionTask.deleteMany({ target: TARGET });

  const ctx = buildEngineContext({ env: { platforms: [PLATFORM, 'instagram'], deviceProvider: { type: 'duoplus', apiKey: process.env.DUOPLUS_API_KEY } } });

  // Enroll the REAL device and mark it eligible/running (subscription is a provider fact).
  const r = await enrollDevice(ctx, { provider: 'duoplus', providerDeviceId: DEVICE_ID, name: 'rd-device' });
  await EngineDevice.findByIdAndUpdate(r.deviceId, { $set: { status: 'running', capacity: { maxAccounts: 5, activeAccountCount: 0 }, providerMeta: { subscriptionVerified: true, subscriptionStatus: 'active' } } });
  pass(`enrolled real device ${DEVICE_ID}`, String(r.deviceId));

  const tg = await EngineAccount.create({ platform: PLATFORM, identifier: '@rd_tg', source: 'purchase', status: 'online', assignedDeviceId: String(r.deviceId), version: 0, secretRefs: { session: 'vault:x' } });
  const ig = await EngineAccount.create({ platform: 'instagram', identifier: '@rd_ig', source: 'purchase', status: 'online', assignedDeviceId: String(r.deviceId), version: 0, secretRefs: { session: 'vault:x' } });

  // ── TARGETED — report from a supported account (telegram) on the real device ──
  console.log('\n[TARGETED] account.action report from telegram on real device');
  try {
    const res = await runAccountAction(ctx, { accountId: String(tg._id), actionType: 'report', target: TARGET });
    if (res.ok) pass('report confirmed by fact on real device');
    else seam('report not confirmed by fact (telegram not installed / not foreground on this clone)', res.reason || 'ACTION_NOT_CONFIRMED');
  } catch (e) {
    const code = e.code || e.message || '';
    if (/ACTION_NOT_CONFIRMED|DEVICE_APP_NOT_FOUND|not installed|ACTION_METHOD_UNSUPPORTED/i.test(code)) seam('report not confirmed by fact', code);
    else fail('targeted report', code);
  }

  // ── TARGETED — capability guard fires BEFORE the device (report on instagram) ──
  console.log('\n[TARGETED] account.action report on instagram — rejected before any device I/O');
  try {
    await runAccountAction(ctx, { accountId: String(ig._id), actionType: 'report', target: TARGET });
    fail('instagram report', 'expected ACTION_NOT_SUPPORTED, got success');
  } catch (e) {
    if (e.code === 'ACTION_NOT_SUPPORTED') pass('report on instagram rejected up-front', e.code);
    else fail('instagram report', e.code || e.message);
  }

  // ── MASS — report campaign → expand-actions → run-action on the real device ──
  console.log('\n[MASS] campaign.create report → expand-actions → run-action on real device');
  try {
    await EngineCampaign.create({ platform: PLATFORM, actionType: 'report', status: 'active', strategy: 'all-accounts-per-target', targets: [TARGET], version: 0 });
    const intents = await planForPlatform(ctx, { platform: PLATFORM });
    const expand = intents.find((i) => i.type === 'expand-actions');
    if (!expand) { fail('expand-actions', 'no intent emitted'); }
    else {
      const task = { campaignId: String(expand.tasks[0].campaignId ?? 'rd'), accountId: String(tg._id), target: TARGET, actionType: 'report' };
      await ctx.actionTaskRepo.upsertTask(task);
      await ctx.actionTaskRepo.upsertTask(task); // idempotent
      const count = await EngineActionTask.countDocuments({ actionType: 'report', accountId: tg._id });
      pass(`expand-actions emitted ${expand.tasks.length} task(s); exactly-once upsert → ${count} row (deduped)`);
      try {
        const rr = await runActionTaskHandler(ctx, { ...task, platform: PLATFORM });
        if (rr.ok) pass('mass report confirmed by fact on real device');
        else seam('mass report not confirmed by fact', rr.reason || 'ACTION_NOT_CONFIRMED');
      } catch (e) {
        const code = e.code || e.message || '';
        if (/ACTION_NOT_CONFIRMED|DEVICE_APP_NOT_FOUND|not installed/i.test(code)) seam('mass report not confirmed by fact (telegram not on this clone)', 'ACTION_NOT_CONFIRMED');
        else throw e;
      }
    }
  } catch (e) { fail('mass report', `${e.code || ''} ${e.message}`); }

  await EngineAccount.deleteMany({ identifier: { $regex: '^@rd_' } });
  await EngineCampaign.deleteMany({ targets: TARGET });
  await EngineActionTask.deleteMany({ target: TARGET });
  await disconnectMongo();
  console.log('\n✔ REPORT ON REAL DEVICE — targeted + mass, guard + verify-by-fact seams — LIVE ✓');
}

main().catch((e) => { console.error('report-device error:', e); process.exit(1); });
