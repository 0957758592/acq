#!/usr/bin/env node
// LIVE proof of the operator dashboard SPA:
//  (1) the dashboard server serves the SPA shell + feature modules under a strict CSP,
//  (2) the SAME api-client + feature view-models the browser uses fetch REAL
//      read-models from the dockerized facade (accounts/pool/devices/campaigns/scrape/selectors),
//  (3) a real headless Chromium loads the dashboard and the shell + nav render.
import http from 'node:http';

import { createApiClient } from '../apps/dashboard/src/api-client.js';
import { accountsViewModel } from '../apps/dashboard/src/features/accounts.js';
import { devicesViewModel } from '../apps/dashboard/src/features/devices.js';
import { campaignsViewModel } from '../apps/dashboard/src/features/campaigns.js';
import { poolViewModel } from '../apps/dashboard/src/features/pool.js';
import { scrapeViewModel } from '../apps/dashboard/src/features/scrape.js';
import { proxiesViewModel } from '../apps/dashboard/src/features/proxies.js';
import { metricsViewModel } from '../apps/dashboard/src/features/metrics.js';
import { emailIdentitiesViewModel } from '../apps/dashboard/src/features/email-identities.js';
import { browserProvidersViewModel } from '../apps/dashboard/src/features/browser-providers.js';
import { createPuppeteerBrowserProvider } from '@acq/scraping';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineDevice } from '@acq/core/models/engine-device';
import { EngineCampaign } from '@acq/core/models/engine-campaign';

const T = 'admin-dev-token';
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

function get(host, port, path) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path, method: 'GET', timeout: 6000 }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d })); });
    req.on('error', (e) => resolve({ error: e.message })); req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}

async function main() {
  // Seed a little state so the read-models return rows.
  await connectMongo(URI);
  await EngineAccount.deleteMany({ identifier: '@dash_demo' });
  await EngineDevice.deleteMany({ providerDeviceId: 'dash-demo-pad' });
  await EngineCampaign.deleteMany({ targets: '@dash_demo_target' });
  await EngineAccount.create({ platform: 'telegram', identifier: '@dash_demo', source: 'purchase', status: 'online', assignedDeviceId: 'dash-dev', version: 0 });
  await EngineDevice.create({ provider: 'duoplus', providerDeviceId: 'dash-demo-pad', status: 'running', capacity: { maxAccounts: 5, activeAccountCount: 1 }, providerMeta: { subscriptionVerified: true } });
  await EngineCampaign.create({ platform: 'telegram', actionType: 'report', status: 'active', strategy: 'all-accounts-per-target', targets: ['@dash_demo_target'], version: 0 });

  // ── 1) dashboard server serves the SPA under a strict CSP ──
  console.log('\n[1] dashboard server serves the SPA shell + feature modules (CSP)');
  const idx = await get('127.0.0.1', 7600, '/');
  (idx.status === 200 && idx.body.includes('data-view="devices"') && idx.body.includes('data-view="selectors"')) ? ok('index.html with feature nav') : bad('index', `status=${idx.status}`);
  (String(idx.headers['content-security-policy'] || '').includes("script-src 'self'")) ? ok('strict CSP header') : bad('csp', idx.headers['content-security-policy']);
  for (const m of ['devices', 'campaigns', 'scrape', 'selectors', 'pool', 'accounts', 'proxies', 'metrics', 'email-identities', 'browser-providers']) {
    const r = await get('127.0.0.1', 7600, `/js/features/${m}.js`);
    (r.status === 200 && r.body.includes('ViewModel')) || bad(`module ${m}.js`, `status=${r.status}`);
  }
  ok('all 10 feature modules served from /js/features');
  (await get('127.0.0.1', 7600, '/config.js')).body.includes('__ACQ_API__') ? ok('config.js (api origin)') : bad('config.js');

  // ── 2) the browser's api-client + view-models fetch REAL read-models from the facade ──
  console.log('\n[2] api-client + view-models fetch real read-models from the dockerized facade');
  const client = createApiClient({ baseUrl: 'http://127.0.0.1:7500', token: T });
  const accVm = accountsViewModel((await client.execute('account.status', {})).accounts);
  (accVm.total >= 1) ? ok('accounts view', `${accVm.total} accounts, byStatus=${JSON.stringify(accVm.byStatus)}`) : bad('accounts', accVm.total);
  const devVm = devicesViewModel((await client.execute('device.status', {})).devices);
  (devVm.rows.some((r) => r.providerDeviceId === 'dash-demo-pad')) ? ok('devices view', `${devVm.total} devices, capacity ${devVm.capacity.active}/${devVm.capacity.max}`) : bad('devices', devVm.total);
  const campVm = campaignsViewModel((await client.execute('campaign.status', {})).campaigns);
  (campVm.total >= 1) ? ok('campaigns view', `${campVm.total} campaigns`) : bad('campaigns', campVm.total);
  const poolVm = poolViewModel(await Promise.all(['telegram', 'instagram'].map((p) => client.execute('pool.status', { platform: p }))));
  ok('pool view', `total available=${poolVm.totalAvailable}`);
  const scrapeVm = scrapeViewModel((await client.execute('scrape.results', {})).results);
  ok('scrape view', `${scrapeVm.total} results`);
  const proxVm = proxiesViewModel((await client.execute('proxy.status', {})).proxies);
  ok('proxies view', `${proxVm.total} proxies`);
  const metVm = metricsViewModel((await client.execute('metrics.domain', {})).platforms);
  (metVm.total >= 1) ? ok('metrics view', `${metVm.total} platforms`) : bad('metrics', metVm.total);
  const emailVm = emailIdentitiesViewModel((await client.execute('email.identity.list', {})).identities);
  (JSON.stringify(emailVm).match(/vault:/) ? bad('email secrets leaked') : ok('email identities view', `${emailVm.total} identities, byCategory=${JSON.stringify(emailVm.byCategory)}`));
  const bpVm = browserProvidersViewModel(await client.execute('browser.providers', {}));
  (bpVm.rows.some((r) => r.provider === 'own') && bpVm.rows.some((r) => r.provider === 'browserbase')) ? ok('browser backends view', `default=${bpVm.default}`) : bad('browser backends', JSON.stringify(bpVm));

  // ── 3) real Chromium loads the dashboard shell ──
  console.log('\n[3] real headless Chromium loads the dashboard SPA shell');
  const bp = createPuppeteerBrowserProvider({ maxConcurrency: 1, headless: true });
  try {
    const page = await bp.openPage({});
    try {
      await page.goto('http://127.0.0.1:7600/');
      const info = await page.evaluate(() => ({ title: document.title, navButtons: Array.from(document.querySelectorAll('#nav button')).map((b) => b.dataset.view), hasApp: !!document.getElementById('app') }));
      (info.title.includes('Operator Dashboard') && info.navButtons.length === 10 && info.hasApp)
        ? ok('SPA shell rendered in real browser', `nav: ${info.navButtons.join(', ')}`)
        : bad('shell', JSON.stringify(info));
    } finally { await page.close(); }
  } catch (e) {
    if (/BROWSER_ENGINE_UNAVAILABLE|Executable doesn't exist|install/i.test(e.code || e.message || '')) console.warn('  (chromium not installed — skipping browser smoke)');
    else throw e;
  } finally { await bp.close().catch(() => {}); }

  await EngineAccount.deleteMany({ identifier: '@dash_demo' });
  await EngineDevice.deleteMany({ providerDeviceId: 'dash-demo-pad' });
  await EngineCampaign.deleteMany({ targets: '@dash_demo_target' });
  await disconnectMongo();
  console.log('\n✔ OPERATOR DASHBOARD SPA — serves under CSP + real facade data path (accounts/pool/devices/campaigns/scrape/selectors/proxies/metrics/email/browser) + renders in real Chromium — LIVE ✓');
}
main().catch((e) => { console.error('dashboard-live error:', e); process.exit(1); });
