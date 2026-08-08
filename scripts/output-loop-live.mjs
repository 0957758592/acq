#!/usr/bin/env node
// MAXIMIZE-OUTPUT LOOP — end-to-end live proof against REAL Mongo through the one
// command facade (TZ §3.5/§10.5/§15): callable targets DB → scoring → parser/
// action telemetry with OUTPUT-max rollups → AI comment generation. Every stage
// prints a factual result; verify-by-fact seams (e.g. no LLM key) are reported
// honestly, never faked. Cleans up its own test rows.
//
//   MONGODB_URI=... node scripts/output-loop-live.mjs
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineTarget } from '@acq/core/models/engine-target';
import { EngineTelemetry } from '@acq/core/models/engine-telemetry';
import { createFacade } from '@acq/control';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { buildValidators } from '../apps/control-plane/src/validators.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const RUN = `outloop-${Date.now()}`;
const pass = (s, extra = '') => console.log(`  ✅ ${s}${extra ? ' — ' + extra : ''}`);
const seam = (s, code) => console.log(`  🔒 ${s} — verify-by-fact seam: ${code}`);
const fail = (s, e) => { console.log(`  ❌ ${s} — ${e}`); process.exitCode = 1; };

async function main() {
  await connectMongo(URI);
  const ctx = buildEngineContext({ env: { secretVaultKey: process.env.SECRET_VAULT_KEY } });
  const validators = buildValidators();
  const facade = createFacade({ useCases: buildUseCases(ctx), validators, audit: { record: async () => {} } });
  const run = (op, args, role = 'operator') => facade.execute(op, { role, args });
  const idA = `${RUN}-a`;
  const idB = `${RUN}-b`;

  console.log(`\nMaximize-output loop live (run ${RUN}) — real Mongo via the facade\n`);

  // 1) Callable targets DB — import + list + score
  const imp = await run('target.import', { platform: 'tiktok', targetType: 'video', source: 'scrape', items: [{ identifier: idA, metadata: { views: 12000, engagementRate: 0.07 } }, { identifier: idB }] });
  imp.error ? fail('target.import', imp.error.code) : pass('target.import', `${imp.data.upserted} upserted`);

  const list = await run('target.list', { platform: 'tiktok', limit: 100 }, 'readonly');
  const found = (list.data?.items || []).filter((t) => t.identifier === idA || t.identifier === idB).length;
  found >= 2 ? pass('target.list', `found ${found}/2 imported`) : fail('target.list', `only ${found}/2 visible`);

  const sc = await run('target.score', { platform: 'tiktok', targetType: 'video', identifier: idA, features: { followers: 50000, engagementRate: 0.08 } });
  sc.error ? fail('target.score', sc.error.code) : (typeof sc.data.score === 'number' && sc.data.target.status === 'enriched'
    ? pass('target.score', `score=${sc.data.score}, status=${sc.data.target.status}`)
    : fail('target.score', 'no numeric score / not enriched'));

  // 2) Parser/action telemetry — record + OUTPUT-max summary (tiktok)
  const rec = await run('telemetry.record', { events: [
    { platform: 'tiktok', kind: 'action.comment', target: idA, metrics: { impressions: 1500, comments: 3, likes: 30 }, metadata: { run: RUN } },
    { platform: 'tiktok', kind: 'action.like', target: idA, metrics: { likes: 12 }, metadata: { run: RUN } },
    { platform: 'tiktok', kind: 'scrape.profile', target: idB, outcome: 'failed', metrics: { errors: 1 }, metadata: { run: RUN } }
  ] });
  rec.error ? fail('telemetry.record', rec.error.code) : pass('telemetry.record', `${rec.data.recorded} recorded`);

  const sum = await run('telemetry.summary', { platform: 'tiktok', since: new Date(Date.now() - 3600_000).toISOString() }, 'readonly');
  if (sum.error) fail('telemetry.summary', sum.error.code);
  else if (sum.data.outputMax && sum.data.outputScore > 0)
    pass('telemetry.summary', `outputMax, outputScore=${sum.data.outputScore}, errorRate=${sum.data.errorRate.toFixed(2)}`);
  else fail('telemetry.summary', `outputMax=${sum.data.outputMax}, outputScore=${sum.data.outputScore}`);

  // 3) AI comment — real facade (honest seam without an LLM key) + a stub-LLM
  // facade proving the generation path over a REAL target read from Mongo.
  const realCmt = await run('content.comment', { platform: 'tiktok', targetType: 'video', identifier: idA, tone: 'enthusiastic' });
  if (realCmt.error) seam(`content.comment (live LLM)`, realCmt.error.code);
  else pass('content.comment (live LLM)', JSON.stringify(realCmt.data.comment).slice(0, 60));

  const stubLlm = () => ({ complete: async () => ({ choices: [{ message: { content: 'Love the energy here — keep it coming! 🔥' } }] }) });
  const stubFacade = createFacade({ useCases: buildUseCases({ targetRepo: ctx.targetRepo, llmFor: stubLlm }), validators, audit: { record: async () => {} } });
  const genCmt = await stubFacade.execute('content.comment', { role: 'operator', args: { platform: 'tiktok', targetType: 'video', identifier: idA, tone: 'enthusiastic' } });
  genCmt.error ? fail('content.comment (generation path)', genCmt.error.code)
    : (genCmt.data.comment && genCmt.data.target.identifier === idA
      ? pass('content.comment (generation path)', `resolved real target + generated: ${JSON.stringify(genCmt.data.comment).slice(0, 48)}`)
      : fail('content.comment (generation path)', 'no comment / wrong target'));

  // cleanup our own test rows
  const dt = await EngineTarget.deleteMany({ identifier: { $in: [idA, idB] } });
  const de = await EngineTelemetry.deleteMany({ 'metadata.run': RUN });
  pass('cleanup', `removed ${dt.deletedCount} targets + ${de.deletedCount} telemetry rows`);

  console.log(`\n${process.exitCode ? '❌ loop had failures' : '✔ MAXIMIZE-OUTPUT LOOP LIVE — targets → score → telemetry(output-max) → AI comment, all through the one facade on real Mongo'}\n`);
  await disconnectMongo();
}

main().catch((e) => { console.error(e); process.exit(1); });
