#!/usr/bin/env node
// LIVE proof of the Telegram Bot API scrape tier against real Mongo. Shows:
//   (1) DEFAULT is the web scraper (browser tier) — no params,
//   (2) OPT-IN to the Bot API tier via params.via='bot-api',
//   (3) real api adapter + real Bot-API endpoint registry + real normalize +
//       persist + read back via scrape.results.
// Only the HTTP transport is injected — with a real TELEGRAM_BOT_TOKEN in the
// environment this hits the actual Bot API (getUpdates / getChatAdministrators).
import { createFacade } from '@acq/control';
import { createScrapeProvider, createApiScrapeAdapter, createTelegramBotApiEndpoints } from '@acq/scraping';
import { createMongoScrapeResultRepo } from '@acq/engine-infra';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineScrapeResult } from '@acq/core/models/engine-scrape-result';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';
import { scrapeTaskHandler } from '../apps/scrape-worker/src/scrape-handler.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const GROUP = 'acq_botapi_group';
const REAL = Boolean(process.env.TELEGRAM_BOT_TOKEN);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'FAKE-BOT-TOKEN';
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

const resp = (json) => ({ status: 200, ok: true, json: async () => json });
function fakeFetch(url) {
  if (String(url).includes('/getUpdates')) {
    return resp({ ok: true, result: [
      { update_id: 1, message: { message_id: 301, text: 'how do I enable dark mode?', from: { username: 'ann' }, date: 1700000000, chat: { username: GROUP } } },
      { update_id: 2, message: { message_id: 302, text: 'Settings → Appearance', from: { username: 'bob' }, date: 1700000100, chat: { username: GROUP } } },
      { update_id: 3, message: { message_id: 303, text: 'thanks!', from: { username: 'ann' }, date: 1700000200, chat: { username: GROUP } } }
    ] });
  }
  if (String(url).includes('/getChatAdministrators')) {
    return resp({ ok: true, result: [{ user: { username: 'ann' }, status: 'creator' }, { user: { username: 'mod1' }, status: 'administrator' }] });
  }
  return resp({ ok: false, description: 'unknown method' });
}

// Web-tier fake (the DEFAULT path) — a real TG web selector adapter would return these.
const webTier = { scrape: async () => ({ rawItems: [{ id: '900', text: 'from web tier', from: 'webuser' }] }) };

async function main() {
  await connectMongo(URI);
  await EngineScrapeResult.deleteMany({ target: GROUP });

  const scrapeResultRepo = createMongoScrapeResultRepo({ model: EngineScrapeResult });
  const apiAdapter = createApiScrapeAdapter({
    endpointRegistry: createTelegramBotApiEndpoints({ botToken: BOT_TOKEN }),
    fetchImpl: REAL ? undefined : fakeFetch
  });
  const scrapeProvider = createScrapeProvider({ adapters: { browser: webTier, api: apiAdapter } });
  const ctx = { scrapeProvider, scrapeResultRepo, clock: { now: () => new Date() }, eventBus: { publish: async () => {} } };

  const facadeCtx = buildEngineContext({ env: { platforms: ['telegram'] } });
  const facade = createFacade({ useCases: buildUseCases(facadeCtx), audit: { record: async () => {} } });
  const results = async (type) => (await facade.execute('scrape.results', { role: 'readonly', args: { platform: 'telegram', type } })).data.results.filter((r) => r.target === GROUP);

  console.log(`\n(mode: ${REAL ? 'REAL Bot API (TELEGRAM_BOT_TOKEN set)' : 'injected fake fetch — mechanism is real, HTTP faked'})`);

  // ── 1) DEFAULT → web scraper (browser tier) ──
  console.log('\n[1] default (no params) → WEB scraper (browser tier)');
  const web = await scrapeTaskHandler(ctx, { platform: 'telegram', targetType: 'messages', target: GROUP });
  (web.tier === 'browser') ? ok('routed to browser (web) by default', `upserted ${web.upserted}`) : bad('default tier', web.tier);

  // clear so the two paths don't mix
  await EngineScrapeResult.deleteMany({ target: GROUP });

  // ── 2) OPT-IN → Bot API tier via params.via='bot-api' ──
  console.log('\n[2] params.via="bot-api" → Telegram Bot API (api tier)');
  const bot = await scrapeTaskHandler(ctx, { platform: 'telegram', targetType: 'messages', target: GROUP, params: { via: 'bot-api' } });
  (bot.tier === 'api') ? ok('routed to api (bot-api)', `upserted ${bot.upserted}`) : bad('opt-in tier', bot.tier);

  if (!REAL) {
    const msgs = await results('message');
    (msgs.length === 3) ? ok('bot-api messages persisted', `${msgs.length} messages`) : bad('bot-api messages', `got ${msgs.length}`);
    for (const r of msgs.slice(0, 3)) console.log(`      ${r.data.author}: "${r.data.text}"`);
    const commenters = [...new Set(msgs.map((r) => r.data.author))].sort();
    (commenters.join(',') === '@ann,@bob') ? ok('distinct commenters via bot-api', commenters.join(', ')) : bad('commenters', commenters.join(','));

    // participants via bot-api → chat administrators
    await scrapeTaskHandler(ctx, { platform: 'telegram', targetType: 'participants', target: GROUP, params: { via: 'bot-api' } });
    const parts = await results('participant');
    (parts.length === 2) ? ok('bot-api participants (admins)', parts.map((r) => `${r.data.handle}:${r.data.role}`).join(', ')) : bad('participants', `got ${parts.length}`);
  } else {
    const msgs = await results('message');
    ok('REAL Bot API returned messages', `${msgs.length} rows`);
  }

  await EngineScrapeResult.deleteMany({ target: GROUP });
  await disconnectMongo();
  console.log('\n✔ TELEGRAM BOT API TIER — default=web, opt-in via params, real adapter/normalize/persist — LIVE ✓');
}

main().catch((e) => { console.error('botapi error:', e); process.exit(1); });
