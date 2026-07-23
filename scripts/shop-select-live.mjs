#!/usr/bin/env node
// LIVE proof of multi-shop procurement against real Mongo: register TWO verified
// telegram shops (different priority + unit price), then show
//   (1) auto-select picks the highest-priority shop,
//   (2) a per-unit budget switches the auto-pick to the cheaper shop,
//   (3) an explicit shopId buys from that specific shop —
// each driving a REAL purchase (compile → balance → purchase → delivery → vault →
// insertAcquired → expense) through an INJECTED fake vendor httpClient (the only
// faked part is the vendor's HTTP responses — exactly what a real shop provides).
import { createFacade } from '@acq/control';
import { connectMongo, disconnectMongo } from '@acq/core/db/mongo';
import { EngineAccount } from '@acq/core/models/engine-account';
import { EngineShopSpec } from '@acq/core/models/engine-shop-spec';
import { EngineExpense } from '@acq/core/models/engine-finance';

import { buildEngineContext } from '../apps/engine/src/composition.js';
import { buildUseCases } from '../apps/control-plane/src/use-cases.js';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/acq';
const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

// Per-shop unit price, keyed by host — lets one fake vendor serve both shops.
const PRICE = { 'prime.example': 300, 'cheap.example': 100 };
let orderSeq = 0;
const fakeVendor = {
  async request({ url }) {
    const u = new URL(url);
    const price = PRICE[u.host];
    if (u.pathname === '/balance') return { data: { balance: 1000000 } };
    if (u.pathname === '/offers') return { data: { unit: price } };
    if (u.pathname === '/buy') return { data: { order: `ORD-${u.host}-${++orderSeq}` } };
    if (u.pathname === '/delivery') return { data: { accounts: [{ phone: `+1555${orderSeq}001`, sess: `s-${orderSeq}` }] } };
    return {};
  }
};

function spec({ shopId, host, priority, unitPriceUsdCents }) {
  return {
    shopId, baseUrl: `https://${host}`, title: shopId, platform: 'telegram', priority, unitPriceUsdCents,
    auth: { kind: 'bearer', config: {} },
    endpoints: {
      balance: { method: 'GET', path: '/balance', responseMap: { balanceUsdCents: 'data.balance' } },
      offers: { method: 'GET', path: '/offers', responseMap: { unitPriceUsdCents: 'data.unit' } },
      purchase: { method: 'POST', path: '/buy', responseMap: { orderId: 'data.order' } },
      delivery: { method: 'GET', path: '/delivery', responseMap: { blob: 'data.accounts' },
        deliveryFormat: { verified: true, format: 'json-array', itemMap: { identifier: 'phone', secrets: { session: 'sess' } } } }
    }
  };
}

async function cleanup() {
  await EngineAccount.deleteMany({ identifier: { $regex: '^\\+1555' } });
  await EngineShopSpec.deleteMany({ shopId: { $in: ['prime', 'cheap'] } });
  await EngineExpense.deleteMany({ provider: { $in: ['prime', 'cheap'] } });
}

async function main() {
  await connectMongo(URI);
  await cleanup();

  // Two facades over the SAME Mongo: one with no budget, one with a per-unit cap.
  const mk = (env) => { const ctx = buildEngineContext({ env: { platforms: ['telegram'], ...env }, deps: { httpClient: fakeVendor } }); return { ctx, facade: createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } }) }; };
  const nobudget = mk({});
  const capped = mk({ maxUnitPriceUsdCents: 200 });

  // ── Register + approve TWO shops (prime: priority 1 / $3.00, cheap: priority 10 / $1.00) ──
  console.log('\n[SETUP] register + approve two telegram shops');
  for (const s of [spec({ shopId: 'prime', host: 'prime.example', priority: 1, unitPriceUsdCents: 300 }), spec({ shopId: 'cheap', host: 'cheap.example', priority: 10, unitPriceUsdCents: 100 })]) {
    const reg = await nobudget.facade.execute('shop.register', { role: 'admin', args: { spec: s } });
    if (!reg.data) { bad(`register ${s.shopId}`, JSON.stringify(reg.error)); continue; }
    const app = await nobudget.facade.execute('shop.approve', { role: 'admin', args: { shopId: s.shopId, approvedBy: 'julian' } });
    if (!app.data) { bad(`approve ${s.shopId}`, JSON.stringify(app.error)); continue; }
    ok(`shop ${s.shopId}`, `registered(verified=${reg.data.verified}) → approved(verified=${app.data.verified})`);
  }

  // ── 1) AUTO-SELECT (no shopId, no budget) → highest priority = prime ──
  console.log('\n[1] pool.acquire without shopId → auto-selects highest-priority shop');
  const a1 = await nobudget.facade.execute('pool.acquire', { role: 'operator', args: { platform: 'telegram', quantity: 1 } });
  const e1 = await EngineExpense.findOne({ externalReference: a1.data.orderId }).lean();
  (e1?.provider === 'prime') ? ok('bought from', `prime (order ${a1.data.orderId}, priority 1)`) : bad('auto-select', `expected prime, got ${e1?.provider}`);

  // ── 2) AUTO-SELECT with a per-unit budget of $2.00 → only cheap qualifies ──
  console.log('\n[2] pool.acquire with maxUnitPriceUsdCents=200 → budget switches auto-pick to cheap');
  const a2 = await capped.facade.execute('pool.acquire', { role: 'operator', args: { platform: 'telegram', quantity: 1 } });
  const e2 = await EngineExpense.findOne({ externalReference: a2.data.orderId }).lean();
  (e2?.provider === 'cheap') ? ok('bought from', `cheap (order ${a2.data.orderId}, ≤ $2.00)`) : bad('budget-select', `expected cheap, got ${e2?.provider}`);

  // ── 3) EXPLICIT shopId → that specific shop regardless of priority ──
  console.log('\n[3] pool.acquire with shopId:"cheap" → buys from that specific shop');
  const a3 = await nobudget.facade.execute('pool.acquire', { role: 'operator', args: { platform: 'telegram', quantity: 1, shopId: 'cheap' } });
  const e3 = await EngineExpense.findOne({ externalReference: a3.data.orderId }).lean();
  (e3?.provider === 'cheap') ? ok('bought from', `cheap (explicit shopId, order ${a3.data.orderId})`) : bad('shopId-select', `expected cheap, got ${e3?.provider}`);

  // ── 4) real delivery landed: accounts inserted with VAULTED secretRefs (raw session never in Mongo) ──
  console.log('\n[4] delivery → account inserted with a vaulted secret ref (raw secret never stored)');
  const acc = await EngineAccount.findOne({ identifier: { $regex: '^\\+1555' } }).lean();
  const ref = acc?.secretRefs?.session;
  (ref && !String(ref).startsWith('s-'))
    ? ok('delivered account vaulted', `${acc.identifier}, session ref=${ref} (not the raw value)`)
    : bad('delivery', ref ? `raw secret leaked: ${ref}` : 'no account inserted');

  // ── 5) unverified shop cannot execute ──
  console.log('\n[5] a non-approved shop is a hard seam');
  await nobudget.facade.execute('shop.register', { role: 'admin', args: { spec: spec({ shopId: 'prime', host: 'prime.example', priority: 1, unitPriceUsdCents: 300 }) } }); // re-register flips verified back to false
  const a5 = await nobudget.facade.execute('pool.acquire', { role: 'operator', args: { platform: 'telegram', quantity: 1, shopId: 'prime' } });
  (a5.error?.code === 'SHOP_SPEC_UNVERIFIED') ? ok('unverified prime rejected', a5.error.code) : bad('verify-gate', JSON.stringify(a5.error ?? a5.data));

  await cleanup();
  await disconnectMongo();
  console.log('\n✔ MULTI-SHOP PROCUREMENT — auto-select (priority) · budget · explicit shopId · verify-gate — LIVE ✓');
}

main().catch((e) => { console.error('shop-select error:', e); process.exit(1); });
