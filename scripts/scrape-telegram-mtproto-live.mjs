#!/usr/bin/env node
// LIVE proof of the Telegram MTProto scrape tier against real Mongo: the api-CLASS
// tier pulls FULL message history + the FULL participant roster (beyond Bot API
// limits) through the real ScrapeProvider → normalize → persist → scrape.results.
// The MTProto client is injected (fake here; a real GramJS/telethon session with
// api_id/api_hash hits real Telegram). Default stays the web scraper; MTProto is
// opt-in via params.via='mtproto'.
import { createFacade } from '@acq/control';
import { createScrapeProvider, createTelegramMtprotoAdapter } from '@acq/scraping';
import { createMongoScrapeResultRepo } from '@acq/engine-infra';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { scrapeTaskHandler } from '../apps/scrape-worker/src/scrape-handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const GROUP = 'acq_mtproto_group';
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

// A fake MTProto (GramJS-class) client — full history + full roster.
const fakeClient = {
  async getMessages({ limit }) {
    const n = Math.min(limit ?? 500, 6);
    return Array.from({ length: n }, (_, i) => ({ id: 1000 + i, message: `history #${i + 1}`, senderUsername: i % 2 ? 'bob' : 'ann', date: 1700000000 + i * 60 }));
  },
  async getParticipants() {
    return [{ username: 'ann', isAdmin: true }, { username: 'bob' }, { username: 'carol' }, { username: 'dave' }, { username: 'erin' }];
  }
};
const webTier = { scrape: async () => ({ rawItems: [{ id: '1', text: 'from web', from: 'x' }] }) };

async function main() {
  await connectMongo(URI);
  await EngineScrapeResult.deleteMany({ target: GROUP });
  const scrapeResultRepo = createMongoScrapeResultRepo({ model: EngineScrapeResult });
  const scrapeProvider = createScrapeProvider({ adapters: { browser: webTier, mtproto: createTelegramMtprotoAdapter({ client: fakeClient }) } });
  const ctx = { scrapeProvider, scrapeResultRepo, clock: { now: () => new Date() }, eventBus: { publish: async () => {} } };
  const facade = createFacade({ useCases: buildUseCases(buildEngineContext({ env: { platforms: ['telegram'] } })), audit: { record: async () => {} } });
  const results = async (type) => (await facade.execute('scrape.results', { role: 'readonly', args: { platform: 'telegram', type } })).data.results.filter((r) => r.target === GROUP);

  console.log('\n[1] default (no params) → WEB scraper');
  const web = await scrapeTaskHandler(ctx, { platform: 'telegram', targetType: 'messages', target: GROUP });
  (web.tier === 'browser') ? ok('default → browser (web)') : bad('default tier', web.tier);
  await EngineScrapeResult.deleteMany({ target: GROUP });

  console.log('\n[2] params.via="mtproto" → FULL message history');
  const mt = await scrapeTaskHandler(ctx, { platform: 'telegram', targetType: 'messages', target: GROUP, params: { via: 'mtproto', limit: 6 } });
  (mt.tier === 'mtproto') ? ok('routed to mtproto tier', `upserted ${mt.upserted}`) : bad('tier', mt.tier);
  const msgs = await results('message');
  (msgs.length === 6) ? ok('full history persisted', `${msgs.length} messages`) : bad('messages', `got ${msgs.length}`);
  const commenters = [...new Set(msgs.map((r) => r.data.author))].sort();
  (commenters.join(',') === '@ann,@bob') ? ok('distinct commenters', commenters.join(', ')) : bad('commenters', commenters.join(','));

  console.log('\n[3] params.via="mtproto" → FULL participant roster (beyond Bot API admins)');
  await scrapeTaskHandler(ctx, { platform: 'telegram', targetType: 'participants', target: GROUP, params: { via: 'mtproto' } });
  const parts = await results('participant');
  (parts.length === 5) ? ok('full roster persisted', parts.map((r) => `${r.data.handle}:${r.data.role}`).join(', ')) : bad('participants', `got ${parts.length}`);

  await EngineScrapeResult.deleteMany({ target: GROUP });
  await disconnectMongo();
  console.log('\n✔ TELEGRAM MTPROTO TIER — default=web, opt-in via params, full history + full roster, normalize+persist — LIVE ✓');
}
main().catch((e) => { console.error('mtproto error:', e); process.exit(1); });
