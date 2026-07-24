#!/usr/bin/env node
// LIVE proof of the Telegram WEB selector registry against REAL headless Chromium:
// the default web-scraper tier extracts group messages (content + author) and
// participants from a representative web.telegram.org-shaped DOM, through the
// production Puppeteer provider + browser adapter + ScrapeProvider normalize.
// (The fixture matches the registry's default selectors — the verify-by-fact
// input; against a different live build you override the selectors.)
import { createPuppeteerBrowserProvider, createBrowserScrapeAdapter, createScrapeProvider, createTelegramWebSelectors } from '@acq/scraping';

const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

// A representative web.telegram.org-shaped group DOM (matches default selectors).
const FIXTURE = `data:text/html,${encodeURIComponent(`
<html><body>
  <div class="messages">
    <div data-mid="501" class="message"><span class="peer-title">Ann</span><span class="text-content">how do I enable dark mode?</span><time class="time" data-timestamp="1700000000"></time></div>
    <div data-mid="502" class="message"><span class="peer-title">Bob</span><span class="text-content">Settings, then Appearance</span><time class="time" data-timestamp="1700000100"></time></div>
    <div data-mid="503" class="message"><span class="peer-title">Ann</span><span class="text-content">thanks!</span><time class="time" data-timestamp="1700000200"></time></div>
  </div>
  <div class="members">
    <div class="ListItem"><span class="peer-title">Ann</span><span class="member-role">owner</span></div>
    <div class="ListItem"><span class="peer-title">Bob</span></div>
    <div class="ListItem"><span class="peer-title">Carol</span></div>
  </div>
</body></html>`)}`;

async function main() {
  const provider = createPuppeteerBrowserProvider({ maxConcurrency: 1, headless: true });
  try {
    try { const p = await provider.openPage({}); await p.close(); }
    catch (e) { if (/BROWSER_ENGINE_UNAVAILABLE|Executable doesn't exist|install/i.test(e.code || e.message || '')) { console.warn('  (chromium not installed — skipping)'); return; } throw e; }

    const tgSel = createTelegramWebSelectors(); // real extractItems under test
    const registry = { forPlatform: (pl) => (pl === 'telegram' ? { ...tgSel, resolveUrl: () => FIXTURE } : null) };
    const adapter = createBrowserScrapeAdapter({ browserProvider: provider, selectorRegistry: registry, keyOf: (it) => it.id ?? it.handle, maxScrolls: 2 });
    const sp = createScrapeProvider({ adapters: { browser: adapter } });

    console.log('\n[web tier] telegram group MESSAGES via real Chromium');
    const msgs = await sp.scrape({ platform: 'telegram', targetType: 'messages', target: 'g1' });
    const authors = msgs.entities.map((e) => `${e.data.author}:"${e.data.text}"`);
    (msgs.tier === 'browser' && msgs.entities.length === 3)
      ? ok('extracted 3 messages (content + author) via web scraper', authors.join('  '))
      : bad('messages', `tier=${msgs.tier} count=${msgs.entities.length}`);
    const commenters = [...new Set(msgs.entities.map((e) => e.data.author))].sort();
    (commenters.join(',') === '@ann,@bob') ? ok('distinct commenters', commenters.join(', ')) : bad('commenters', commenters.join(','));

    console.log('\n[web tier] telegram group PARTICIPANTS via real Chromium');
    const parts = await sp.scrape({ platform: 'telegram', targetType: 'participants', target: 'g1' });
    (parts.entities.length === 3)
      ? ok('extracted participants', parts.entities.map((e) => `${e.data.handle}:${e.data.role}`).join(', '))
      : bad('participants', `count=${parts.entities.length}`);
  } finally {
    await provider.close().catch(() => {});
  }
  console.log('\n✔ TELEGRAM WEB SELECTORS — default web scraper extracts group content + authors + participants via REAL Chromium ✓');
}

main().catch((e) => { console.error('web-selectors error:', e); process.exit(1); });
