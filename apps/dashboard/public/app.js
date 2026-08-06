// Dashboard SPA glue (thin presentation, TZ §11.9). Wires the unit-tested
// api-client + feature view-models to the DOM over the control-plane facade. All
// business logic lives behind the facade; this only renders server-state and
// dispatches operations. A top-level error boundary surfaces failures without
// unsafe HTML injection (textContent only).
import { createApiClient } from '/js/api-client.js';
import { accountsViewModel } from '/js/features/accounts.js';
import { poolViewModel } from '/js/features/pool.js';
import { devicesViewModel } from '/js/features/devices.js';
import { campaignsViewModel } from '/js/features/campaigns.js';
import { scrapeViewModel } from '/js/features/scrape.js';
import { selectorsViewModel } from '/js/features/selectors.js';
import { proxiesViewModel } from '/js/features/proxies.js';
import { metricsViewModel } from '/js/features/metrics.js';
import { emailIdentitiesViewModel } from '/js/features/email-identities.js';
import { browserProvidersViewModel } from '/js/features/browser-providers.js';

const apiOrigin = window.__ACQ_API__ && window.__ACQ_API__ !== 'self' ? window.__ACQ_API__ : '';
const PLATFORMS = ['whatsapp', 'telegram', 'discord', 'facebook', 'gmail', 'tiktok', 'instagram', 'youtube', 'linkedin'];
let client = null;

const $ = (id) => document.getElementById(id);
function showError(message) { const el = $('error-boundary'); el.textContent = `Error: ${message}`; el.hidden = false; }
function clearError() { const el = $('error-boundary'); el.hidden = true; el.textContent = ''; }

// Generic accessible renderer: summary chips + a data table. DRY across features.
function render({ title, chips = [], columns, rows }) {
  const app = $('app');
  app.replaceChildren();
  const section = document.createElement('section');
  section.setAttribute('aria-label', title);
  const h = document.createElement('h2');
  h.textContent = title;
  section.append(h);
  if (chips.length) {
    const bar = document.createElement('div');
    bar.className = 'chips';
    for (const c of chips) { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = c; bar.append(chip); }
    section.append(bar);
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const col of columns) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = col.label; hr.append(th); }
  thead.append(hr);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const col of columns) { const td = document.createElement('td'); td.textContent = String(col.get(row) ?? '—'); tr.append(td); }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  if (!rows.length) { const p = document.createElement('p'); p.textContent = 'No rows.'; section.append(p); }
  section.append(table);
  app.append(section);
}

const chipsOf = (obj) => Object.entries(obj).map(([k, v]) => `${k}: ${v}`);

const VIEWS = {
  async accounts() {
    const { accounts = [] } = await client.execute('account.status', {});
    const vm = accountsViewModel(accounts);
    render({ title: `Accounts (${vm.total})`, chips: chipsOf(vm.byStatus),
      columns: [{ label: 'Platform', get: (r) => r.platform }, { label: 'Identifier', get: (r) => r.identifier }, { label: 'Status', get: (r) => r.status }, { label: 'Device', get: (r) => r.device }, { label: 'Score', get: (r) => r.score }], rows: vm.rows });
  },
  async pool() {
    const statuses = await Promise.all(PLATFORMS.map((p) => client.execute('pool.status', { platform: p })));
    const vm = poolViewModel(statuses);
    render({ title: `Pool availability (${vm.totalAvailable})`, columns: [{ label: 'Platform', get: (r) => r.platform }, { label: 'Source', get: (r) => r.source }, { label: 'Available', get: (r) => r.available }], rows: vm.rows });
  },
  async devices() {
    const { devices = [] } = await client.execute('device.status', {});
    const vm = devicesViewModel(devices);
    render({ title: `Devices (${vm.total})`, chips: [...chipsOf(vm.byStatus), `capacity: ${vm.capacity.active}/${vm.capacity.max}`],
      columns: [{ label: 'Provider', get: (r) => r.provider }, { label: 'Device', get: (r) => r.providerDeviceId }, { label: 'Status', get: (r) => r.status }, { label: 'Accounts', get: (r) => `${r.activeAccounts}/${r.maxAccounts}` }, { label: 'Sub', get: (r) => (r.subscriptionVerified ? '✓' : '—') }], rows: vm.rows });
  },
  async campaigns() {
    const { campaigns = [] } = await client.execute('campaign.status', {});
    const vm = campaignsViewModel(campaigns);
    render({ title: `Campaigns (${vm.total})`, chips: chipsOf(vm.byStatus),
      columns: [{ label: 'Platform', get: (r) => r.platform }, { label: 'Action', get: (r) => r.actionType }, { label: 'Status', get: (r) => r.status }, { label: 'Strategy', get: (r) => r.strategy }, { label: 'Targets', get: (r) => r.targetCount }], rows: vm.rows });
  },
  async scrape() {
    const { results = [] } = await client.execute('scrape.results', {});
    const vm = scrapeViewModel(results);
    render({ title: `Scrape results (${vm.total})`, chips: chipsOf(vm.byType),
      columns: [{ label: 'Platform', get: (r) => r.platform }, { label: 'Type', get: (r) => r.type }, { label: 'Target', get: (r) => r.target }, { label: 'Summary', get: (r) => r.summary }], rows: vm.rows });
  },
  async selectors() {
    const overrides = [];
    for (const p of PLATFORMS) {
      try { const r = await client.execute('device.selectors', { platform: p }); if (Object.keys(r.selectors || {}).length) overrides.push(r); } catch { /* skip */ }
    }
    const vm = selectorsViewModel(overrides);
    render({ title: `On-device selectors (${vm.total})`, columns: [{ label: 'Platform', get: (r) => r.platform }, { label: 'Groups', get: (r) => r.groups.join(', ') }, { label: 'Overrides', get: (r) => r.json }], rows: vm.rows });
  },
  async proxies() {
    const { proxies = [] } = await client.execute('proxy.status', {});
    const vm = proxiesViewModel(proxies);
    render({ title: `Proxies (${vm.total})`, chips: chipsOf(vm.byStatus),
      columns: [{ label: 'ID', get: (r) => r.id }, { label: 'Geo', get: (r) => r.geo }, { label: 'Status', get: (r) => r.status }, { label: 'Device', get: (r) => r.device }, { label: 'Health', get: (r) => r.health }], rows: vm.rows });
  },
  async metrics() {
    const { platforms = [] } = await client.execute('metrics.domain', {});
    const vm = metricsViewModel(platforms);
    render({ title: `Domain metrics (${vm.total} platforms)`,
      columns: [{ label: 'Platform', get: (r) => r.platform }, { label: 'Pool', get: (r) => r.poolAvailable }, { label: 'Online', get: (r) => r.online }, { label: 'Banned', get: (r) => r.banned }, { label: 'Ban share', get: (r) => r.banShare }, { label: 'Campaigns', get: (r) => r.campaigns }, { label: 'Max sat.', get: (r) => r.maxSaturation }], rows: vm.rows });
  },
  async email() {
    const { identities = [] } = await client.execute('email.identity.list', {});
    const vm = emailIdentitiesViewModel(identities);
    render({ title: `Email identities (${vm.total})`, chips: chipsOf(vm.byCategory),
      columns: [{ label: 'Address', get: (r) => r.address }, { label: 'Provider', get: (r) => r.provider }, { label: 'Type', get: (r) => r.category }, { label: 'Auth', get: (r) => r.auth }, { label: 'Status', get: (r) => r.status }], rows: vm.rows });
  },
  async browser() {
    const { providers = [], default: def } = await client.execute('browser.providers', {});
    const vm = browserProvidersViewModel({ providers, default: def });
    render({ title: `Browser backends (default: ${vm.default})`,
      columns: [{ label: 'Backend', get: (r) => r.provider }, { label: 'Kind', get: (r) => r.kind }, { label: 'Configured', get: (r) => r.configured }, { label: 'Concurrency', get: (r) => r.concurrency }, { label: 'Default', get: (r) => (r.isDefault ? '✓' : '—') }], rows: vm.rows });
  }
};

async function show(view) {
  clearError();
  for (const b of document.querySelectorAll('#nav button')) b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false');
  try { await VIEWS[view](); } catch (err) { showError(err.code ? `${err.code}: ${err.message}` : err.message); }
}

$('auth').addEventListener('submit', (e) => {
  e.preventDefault();
  const token = $('token').value.trim();
  if (!token) return;
  client = createApiClient({ baseUrl: apiOrigin, token });
  $('nav').hidden = false;
  show('accounts');
});
$('nav').addEventListener('click', (e) => { const v = e.target?.dataset?.view; if (v && client) show(v); });
