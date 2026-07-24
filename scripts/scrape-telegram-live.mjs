#!/usr/bin/env node
// LIVE proof of Telegram group-content scraping against real Mongo: drive the
// REAL scrape task handler (normalize → idempotent upsert) for `messages` and
// `participants`, then read them back through the facade's `scrape.results` —
// yielding (1) the group CONTENT (questions/comments) with WHO wrote each, and
// (2) the distinct set of users who commented, ready to feed intelligence.
//
// Only the tier's raw I/O is faked (an injected adapter returning raw TG items) —
// exactly the verify-by-fact seam a real Telegram web-selector / MTProto adapter
// fills. Everything downstream (normalize, key, dedup, persist, query) is real.
import { createFacade } from '@acq/control';
import { createScrapeProvider } from '@acq/scraping';
import { createMongoScrapeResultRepo } from '@acq/engine-infra';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { scrapeTaskHandler } from '../apps/scrape-worker/src/scrape-handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const GROUP = 'acq_demo_group';
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

// Raw items as a Telegram tier (web selectors / Bot API / MTProto) would emit.
const RAW_MESSAGES = [
  { id: '101', text: 'how do I reset 2FA?', author: { username: 'ann' }, ts: '2026-07-24T09:00:00Z' },
  { id: '102', text: 'same question here', from: 'bob', date: 1700000000 },
  { message_id: 103, message: 'try settings → privacy', from: '@carol' },
  { id: '104', text: 'thanks carol!', author: { username: 'ann' } }
];
const RAW_PARTICIPANTS = [{ username: 'ann' }, { handle: '@bob' }, { username: 'carol' }, { username: 'dave' }];

function fakeTelegramTier(byType) {
  return { async scrape({ targetType }) { return { rawItems: byType[targetType] ?? [] }; } };
}

async function run(ctx, targetType) {
  // routing.needsLogin → the browser tier (where a real TG web adapter lives).
  return scrapeTaskHandler(ctx, { platform: 'telegram', targetType, target: GROUP, routing: { needsLogin: true } });
}

async function main() {
  await connectMongo(URI);
  await EngineScrapeResult.deleteMany({ target: GROUP });

  const scrapeResultRepo = createMongoScrapeResultRepo({ model: EngineScrapeResult });
  const scrapeProvider = createScrapeProvider({
    adapters: { browser: fakeTelegramTier({ messages: RAW_MESSAGES, participants: RAW_PARTICIPANTS }) }
  });
  const ctx = { scrapeProvider, scrapeResultRepo, clock: { now: () => new Date() }, eventBus: { publish: async () => {} } };

  // Facade for reading results back over the real control surface.
  const facadeCtx = buildEngineContext({ env: { platforms: ['telegram'] } });
  const facade = createFacade({ useCases: buildUseCases(facadeCtx), audit: { record: async () => {} } });

  // ── 1) scrape group MESSAGES (content + author) ──
  console.log('\n[1] scrape telegram group messages (content + who wrote each)');
  const m = await run(ctx, 'messages');
  ok(`handler ran via tier '${m.tier}'`, `upserted ${m.upserted}`);
  const msgs = (await facade.execute('scrape.results', { role: 'readonly', args: { platform: 'telegram', type: 'message' } })).data.results.filter((r) => r.target === GROUP);
  (msgs.length === RAW_MESSAGES.length) ? ok('messages persisted + retrievable via scrape.results', `${msgs.length} messages`) : bad('messages', `expected ${RAW_MESSAGES.length}, got ${msgs.length}`);
  console.log('    content sample:');
  for (const r of msgs.slice(0, 3)) console.log(`      ${r.data.author}: "${r.data.text}"  [${r.key}]`);

  // ── 2) the users who COMMENTED — distinct authors across the messages ──
  console.log('\n[2] gather all users who commented (distinct message authors)');
  const commenters = [...new Set(msgs.map((r) => r.data.author))].sort();
  (commenters.length === 3 && commenters.includes('@ann') && commenters.includes('@carol'))
    ? ok('distinct commenters', commenters.join(', '))
    : bad('commenters', JSON.stringify(commenters));

  // ── 3) scrape PARTICIPANTS (full active-user set) ──
  console.log('\n[3] scrape telegram group participants (distinct users)');
  const p = await run(ctx, 'participants');
  const parts = (await facade.execute('scrape.results', { role: 'readonly', args: { platform: 'telegram', type: 'participant' } })).data.results.filter((r) => r.target === GROUP);
  (parts.length === RAW_PARTICIPANTS.length) ? ok('participants persisted', parts.map((r) => r.data.handle).join(', ')) : bad('participants', `got ${parts.length}`);

  // ── 4) idempotency: re-scraping the same messages does not duplicate ──
  console.log('\n[4] idempotency — re-scrape same messages, exactly-once by natural key');
  await run(ctx, 'messages');
  const after = await EngineScrapeResult.countDocuments({ target: GROUP, type: 'message' });
  (after === RAW_MESSAGES.length) ? ok('no duplicates after re-scrape', `${after} message rows (deduped by key)`) : bad('idempotency', `${after} rows`);

  await EngineScrapeResult.deleteMany({ target: GROUP });
  await disconnectMongo();
  console.log('\n✔ TELEGRAM GROUP SCRAPE — content + authors + distinct commenters + participants, persisted & retrievable, idempotent — LIVE ✓');
}

main().catch((e) => { console.error('scrape-telegram error:', e); process.exit(1); });
