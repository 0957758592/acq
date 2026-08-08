import { planForPlatform } from '../../engine/src/snapshot.js';
import { acquireHandler } from '../../engine/src/handlers/acquire.handler.js';
import { applyAccountTransition, reassignAccount } from '../../engine/src/services/account-lifecycle.js';
import { enrollDevice } from '../../engine/src/services/device-enroll.js';
import { probeAccount, runAccountAction } from '../../engine/src/services/account-ops.js';
import { assertSupportedAction } from '../../engine/src/services/action-support.js';
import { proxyStatus, assignDeviceProxy, rotateDeviceProxy } from '../../engine/src/services/proxy-ops.js';
import { scanShop } from '../../engine/src/services/scan-shop.js';
import { shopBuy } from '../../engine/src/services/shop-buy.js';
import { shopDeliver } from '../../engine/src/services/shop-deliver.js';
import { browserLoginFromCookies } from '../../engine/src/services/browser-login.js';
import { domainSnapshot } from '../../engine/src/services/domain-snapshot.js';
import { evaluateSlos } from '@acq/core/observability/slo';
import { paginate } from '@acq/core/db/paginate';
import { listMailProviders } from '@acq/integrations';
import { scoreAccount, scoreTarget } from '@acq/intelligence';
import { generatePersona } from '@acq/account-gen';

function require$(args, field, code) {
  const v = args?.[field];
  if (v === undefined || v === null || v === '') {
    throw Object.assign(new Error(`${code}: ${field} is required`), { code });
  }
  return v;
}

function seam(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

// Target selector: an explicit `id`, else the natural (platform,targetType,
// identifier) triple (all required in that case). Shared by the target.* ops.
function targetSelector(args = {}, req) {
  if (args.id) return { id: args.id };
  return {
    platform: req(args, 'platform', 'PLATFORM_REQUIRED'),
    targetType: req(args, 'targetType', 'TARGET_TYPE_REQUIRED'),
    identifier: req(args, 'identifier', 'IDENTIFIER_REQUIRED')
  };
}

// Wires facade operations to real application logic over the engine context
// (TZ §11.1). ONE definition per operation, exposed identically across every
// surface (MCP/REST/CLI/SSE/webhooks) via the facade. Generic across platforms —
// nothing here branches on a specific messenger. Operations without a handler
// fall through to NOT_IMPLEMENTED as their subsystems land.
export function buildUseCases(ctx) {
  // Resolve the SELECTED browser backend (own pool / Browserbase cloud) behind the
  // one port. A keyless cloud pick fails safe with its own coded seam.
  const browserBackend = (provider) => {
    if (ctx.browserBackendFor) return ctx.browserBackendFor({ provider });
    if (!ctx.browserProvider) throw seam('BROWSER_PROVIDER_UNAVAILABLE', 'no browser provider wired');
    return ctx.browserProvider;
  };
  // Stagehand-style actor bound to a chosen browser backend + LLM vendor.
  const aiActor = (args = {}) => {
    if (!ctx.aiActorFor) throw seam('AI_ACTOR_UNAVAILABLE', 'no ai actor wired');
    return ctx.aiActorFor({ provider: args.provider, model: args.model, browserProvider: browserBackend(args.browserProvider) });
  };
  return {
    // ---- Pool / acquisition ------------------------------------------------
    'pool.status': async (args = {}) => {
      const platform = args.platform;
      const source = args.source ?? 'purchase';
      const available = await ctx.accountRepo.countAvailable({ platform, source });
      return { platform, source, available };
    },
    'pool.acquire': async (args = {}) => {
      const platform = require$(args, 'platform', 'PLATFORM_REQUIRED');
      const quantity = args.quantity ?? ctx.config?.buyBatchSize ?? 5;
      return acquireHandler(ctx, { platform, source: args.source ?? 'purchase', quantity, shopId: args.shopId, deviceId: args.deviceId, niche: args.niche, locale: args.locale });
    },

    // ---- Devices -----------------------------------------------------------
    'device.enroll': async (args = {}) => {
      require$(args, 'providerDeviceId', 'PROVIDER_DEVICE_ID_REQUIRED');
      return enrollDevice(ctx, args);
    },
    'device.queue.get': async (args = {}) => {
      const deviceId = require$(args, 'deviceId', 'DEVICE_ID_REQUIRED');
      const platform = require$(args, 'platform', 'PLATFORM_REQUIRED');
      return ctx.deviceQueueRepo.find(deviceId, platform);
    },
    // List enrolled cloud-phone devices (read-model for the dashboard/brain).
    'device.status': async (args = {}) => {
      if (!ctx.deviceModel) return { devices: [], nextCursor: null };
      const filter = { ...(args.status ? { status: args.status } : {}), ...(args.provider ? { provider: args.provider } : {}) };
      const { items, nextCursor } = await paginate(ctx.deviceModel, filter, { cursor: args.cursor ?? null, limit: args.limit });
      return { devices: items, nextCursor };
    },
    // On-device selector overrides (read/tune the login/action/report selector
    // text sets for a live app build). Absent store -> honest coded seam.
    'device.selectors': async (args = {}) => {
      if (!ctx.selectorStore) throw seam('SELECTOR_STORE_UNAVAILABLE', 'selector store not wired');
      return ctx.selectorStore.get(require$(args, 'platform', 'PLATFORM_REQUIRED'));
    },
    'device.selectors.set': async (args = {}) => {
      if (!ctx.selectorStore) throw seam('SELECTOR_STORE_UNAVAILABLE', 'selector store not wired');
      return ctx.selectorStore.set(require$(args, 'platform', 'PLATFORM_REQUIRED'), require$(args, 'selectors', 'SELECTORS_REQUIRED'), { updatedBy: args.updatedBy ?? null });
    },

    // ---- Campaigns ---------------------------------------------------------
    'campaign.create': async (args = {}) => {
      require$(args, 'platform', 'PLATFORM_REQUIRED');
      require$(args, 'actionType', 'ACTION_TYPE_REQUIRED');
      // Reject a mass campaign whose action the platform can't perform, before
      // any row is created or fanned out into per-account tasks.
      assertSupportedAction(args.platform, args.actionType);
      const created = await ctx.campaignRepo.createCampaign({
        platform: args.platform,
        actionType: args.actionType,
        strategy: args.strategy ?? 'all-accounts-per-target',
        targets: args.targets ?? [],
        params: args.params ?? {},
        status: args.status ?? 'active'
      });
      return { campaignId: String(created._id), platform: created.platform, actionType: created.actionType, status: created.status };
    },
    'campaign.status': async (args = {}) => {
      if (args.campaignId) return { campaign: await ctx.campaignRepo.findCampaign(args.campaignId) };
      return { campaigns: await ctx.campaignRepo.listActiveCampaigns(args.platform) };
    },
    'action.retry': async (args = {}) => {
      const key = {
        campaignId: require$(args, 'campaignId', 'CAMPAIGN_ID_REQUIRED'),
        accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'),
        target: require$(args, 'target', 'TARGET_REQUIRED'),
        actionType: require$(args, 'actionType', 'ACTION_TYPE_REQUIRED')
      };
      const updated = await ctx.actionTaskRepo.markTask(key, 'pending');
      if (!updated) throw Object.assign(new Error('ACTION_TASK_NOT_FOUND: task not found'), { code: 'ACTION_TASK_NOT_FOUND' });
      return { ...key, status: 'pending' };
    },
    'campaign.pause': async (args = {}) => setStatus(ctx, args, 'paused'),
    'campaign.resume': async (args = {}) => setStatus(ctx, args, 'active'),
    'campaign.stop': async (args = {}) => setStatus(ctx, args, 'stopped'),

    // ---- Accounts ----------------------------------------------------------
    'account.status': async (args = {}) => {
      // A single-account lookup is a point read; a list is cursor-paginated
      // (REQUIREM §2.5) so it never loads the whole inventory.
      if (args.accountId) return { accounts: await ctx.accountRepo.find({ _id: args.accountId }), nextCursor: null };
      const filter = args.platform ? { platform: args.platform } : {};
      if (ctx.accountRepo.page) {
        const { items, nextCursor } = await ctx.accountRepo.page(filter, { cursor: args.cursor ?? null, limit: args.limit });
        return { accounts: items, nextCursor };
      }
      return { accounts: await ctx.accountRepo.find(filter), nextCursor: null };
    },
    'account.retire': async (args = {}) => applyAccountTransition(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'), to: 'retired' }),
    'account.cooldown': async (args = {}) => applyAccountTransition(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'), to: 'cooldown' }),
    'account.resume': async (args = {}) => applyAccountTransition(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'), to: 'online' }),
    'account.reassign': async (args = {}) => reassignAccount(ctx, {
      accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'),
      deviceId: require$(args, 'deviceId', 'DEVICE_ID_REQUIRED')
    }),
    'account.probe': async (args = {}) => probeAccount(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED') }),
    'account.refreshSession': async (args = {}) =>
      // Mark an online account for re-login; the engine's bring-online flow
      // re-imports/re-authenticates it back to online (online -> bringing_online).
      applyAccountTransition(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'), to: 'bringing_online' }),
    'account.tag': async (args = {}) => {
      const doc = await ctx.accountRepo.tag(require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'), { add: args.add ?? [], remove: args.remove ?? [] });
      return { accountId: args.accountId, tags: doc?.tags ?? [] };
    },
    'account.bulk': async (args = {}) => {
      const to = require$(args, 'to', 'TO_REQUIRED'); // target lifecycle state
      const limit = Math.min(args.limit ?? 100, 500);
      const rows = await ctx.accountRepo.find({ platform: args.platform, ...(args.status ? { status: args.status } : {}) });
      const targets = rows.slice(0, limit);
      const results = [];
      for (const doc of targets) {
        try {
          const r = await applyAccountTransition(ctx, { accountId: String(doc._id), to });
          results.push({ accountId: String(doc._id), ok: true, status: r.status });
        } catch (err) {
          results.push({ accountId: String(doc._id), ok: false, code: err.code ?? 'ERROR' });
        }
      }
      return { requested: targets.length, applied: results.filter((r) => r.ok).length, results };
    },
    // Browser (desktop) login for cookie accounts (LinkedIn etc.) — restore a
    // browser session from the account's vaulted cookies + verify by fact. The
    // path that bypasses on-device app anti-automation.
    'account.browserLogin': async (args = {}) => browserLoginFromCookies(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED') }),

    'account.action': async (args = {}) => runAccountAction(ctx, {
      accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'),
      actionType: require$(args, 'actionType', 'ACTION_TYPE_REQUIRED'),
      target: require$(args, 'target', 'TARGET_REQUIRED')
    }),

    // ---- Shops (declarative procurement specs) -----------------------------
    'shop.register': async (args = {}) => {
      const doc = await ctx.shopRegistry.register(require$(args, 'spec', 'SPEC_REQUIRED'));
      return { shopId: doc.shopId, verified: doc.verified };
    },
    'shop.approve': async (args = {}) => {
      const doc = await ctx.shopRegistry.approve(require$(args, 'shopId', 'SHOP_ID_REQUIRED'), { approvedBy: args.approvedBy ?? null });
      if (!doc) throw Object.assign(new Error('SHOP_NOT_FOUND: shop not found'), { code: 'SHOP_NOT_FOUND' });
      return { shopId: doc.shopId, verified: doc.verified };
    },
    // Read the reseller vendor's live balance (keystore-api shops, e.g.
    // dark.shopping) on every surface, so the brain/operator can see funds before
    // buying. Returns the raw vendor amount + a USD-cents conversion when an FX
    // rate is configured (never hardcoded). Absent vendor -> honest coded seam.
    'shop.balance': async (args = {}) => {
      const raw = await ctx.shopVendorFor(args.shopId).getBalance();
      const balance = Number(raw.balance);
      const rubPerUsd = ctx.config?.rubPerUsd ?? null;
      const balanceUsdCents = rubPerUsd && raw.currency === 'RUB' && Number.isFinite(balance)
        ? Math.round((balance / rubPerUsd) * 100)
        : null;
      return { shopId: args.shopId ?? ctx.defaultShopId ?? 'dark.shopping', balance, currency: raw.currency, balanceUsdCents };
    },
    // Search the vendor catalog by (query|platform+country)+stock+price — the REAL
    // inventory (the vendor's product/list), which surfaces far more than category
    // browsing. Maps facade args to the vendor's search params; one op, all
    // surfaces. Read-only (no spend), so brain/operator can pick what to buy.
    'shop.search': async (args = {}) => {
      const name = args.query ?? ([args.platform, args.country].filter(Boolean).join(' ') || undefined);
      const items = await ctx.shopVendorFor(args.shopId).listProducts({
        name,
        category_id: args.categoryId,
        group_id: args.groupId,
        only_in_stock: args.onlyInStock ? 1 : undefined,
        price_from: args.priceFromRub,
        price_to: args.priceToRub,
        quantity_from: args.quantityFrom
      });
      // Narrow by country keyword client-side (the vendor embeds it in the name).
      const matched = args.country
        ? items.filter((p) => String(p.name).toLowerCase().includes(String(args.country).toLowerCase()))
        : items;
      const capped = args.limit ? matched.slice(0, args.limit) : matched;
      return {
        shopId: args.shopId ?? ctx.defaultShopId ?? 'dark.shopping',
        count: capped.length,
        items: capped.map((p) => ({ id: p.id, name: p.name, price: p.price, quantity: p.quantity, minimum_order: p.minimum_order }))
      };
    },

    // Search-driven purchase (reseller shops). Without `confirm:true` it returns a
    // dry PLAN (selected product + price + projected balance) and spends NOTHING —
    // the approval surface for the brain/operator. `confirm:true` places the order
    // by product id with an idempotence key. One op, every surface.
    'shop.buy': async (args = {}) => shopBuy(ctx, args),

    // Deliver + import a COMPLETED order into the pool: fetch order/download, parse,
    // vault credentials (encrypted at rest), insertAcquired. The async tail of the
    // buy path — also what the autonomous acquire job calls once status=completed.
    'shop.deliver': async (args = {}) => shopDeliver(ctx, args),

    // The AI backend is selectable per call: pass provider/model to scan with a
    // different vendor (openai | anthropic | google | openrouter | custom).
    'shop.scan': async (args = {}) => scanShop(ctx, {
      shopUrl: require$(args, 'shopUrl', 'SHOP_URL_REQUIRED'),
      dryRun: Boolean(args.dryRun),
      // Pick a scanner bound to the chosen LLM vendor AND browser backend when the
      // caller overrides any of them (own pool / Browserbase). No override → the
      // default wired scanner.
      scanner: (args.provider || args.model || args.browserProvider) && ctx.scannerFor
        ? ctx.scannerFor({ provider: args.provider, model: args.model, browserProvider: args.browserProvider })
        : null
    }),

    // ---- Email identities (operator-owned mailboxes, ANY provider) ---------
    // Catalog of supported mail providers + their IMAP readiness (picker data).
    'email.providers': async () => ({ providers: listMailProviders() }),
    'email.identity.register': async (args = {}) => {
      if (!ctx.emailIdentityStore) throw seam('EMAIL_IDENTITY_STORE_UNAVAILABLE', 'email identity store not wired');
      // A secret ref is required — either passwordRef OR accessTokenRef (OAuth).
      // The store enforces "at least one" with a coded seam, so both stay optional
      // here and modern-auth mailboxes register token-only.
      return ctx.emailIdentityStore.register({
        address: require$(args, 'address', 'ADDRESS_REQUIRED'),
        provider: args.provider ?? 'custom',
        category: args.category ?? 'standard',
        imapHost: args.imapHost ?? '',
        imapPort: args.imapPort ?? 993,
        passwordRef: args.passwordRef,
        accessTokenRef: args.accessTokenRef,
        notes: args.notes ?? ''
      });
    },
    'email.identity.list': async (args = {}) => {
      if (!ctx.emailIdentityStore) throw seam('EMAIL_IDENTITY_STORE_UNAVAILABLE', 'email identity store not wired');
      if (ctx.emailIdentityStore.page) {
        const { items, nextCursor } = await ctx.emailIdentityStore.page({ category: args.category ?? null, cursor: args.cursor ?? null, limit: args.limit });
        return { identities: items, nextCursor };
      }
      return { identities: await ctx.emailIdentityStore.list({ category: args.category ?? null }), nextCursor: null };
    },
    'email.identity.disable': async (args = {}) => {
      if (!ctx.emailIdentityStore) throw seam('EMAIL_IDENTITY_STORE_UNAVAILABLE', 'email identity store not wired');
      return ctx.emailIdentityStore.disable(require$(args, 'address', 'ADDRESS_REQUIRED'));
    },

    // ---- AI backends (pluggable LLM providers + model picker) --------------
    'llm.providers': async () => {
      if (!ctx.llmProviders) throw seam('LLM_UNAVAILABLE', 'no LLM registry wired');
      return { providers: ctx.llmProviders(), default: ctx.defaultLlmProvider ?? null };
    },
    // Pluggable browser backends (own self-hosted pool + Browserbase cloud) for
    // logins/scraping — listed on every surface so the operator/brain can pick a
    // backend per job. Mirrors llm.providers/email.providers (one facade op).
    'browser.providers': async () => {
      if (!ctx.browserProviders) throw seam('BROWSER_REGISTRY_UNAVAILABLE', 'no browser backend registry wired');
      return { providers: ctx.browserProviders(), default: ctx.defaultBrowserProvider ?? 'own' };
    },
    // Run a completion through ANY configured vendor/model — the platform's own
    // AI entry point, usable by the brain and every surface alike.
    'llm.complete': async (args = {}) => {
      if (!ctx.llmFor) throw seam('LLM_UNAVAILABLE', 'no LLM registry wired');
      const client = ctx.llmFor({ provider: args.provider, model: args.model });
      const out = await client.complete({
        messages: require$(args, 'messages', 'MESSAGES_REQUIRED'),
        temperature: args.temperature ?? 0.7,
        maxTokens: args.maxTokens ?? null,
        responseFormat: args.responseFormat ?? null
      });
      return { provider: out.provider, model: out.model, content: out.content };
    },
    // Register AN ACCOUNT at a shop via an email identity (credentials are REFS,
    // never plaintext). Absent wiring is an honest coded seam.
    'shop.signup': async (args = {}) => {
      if (!ctx.shopSignup) throw seam('SHOP_SIGNUP_PROVIDER_UNAVAILABLE', 'shop signup is not wired');
      // Either a registered identity  (any provider) OR explicit refs.
      if (!args.address) { require$(args, 'emailRef', 'EMAIL_REF_REQUIRED'); require$(args, 'passwordRef', 'PASSWORD_REF_REQUIRED'); }
      return ctx.shopSignup.signup(require$(args, 'shopId', 'SHOP_ID_REQUIRED'), {
        address: args.address ?? null,
        emailRef: args.emailRef,
        passwordRef: args.passwordRef,
        usernameRef: args.usernameRef,
        extraFields: args.extraFields ?? {}
      });
    },
    'shop.signup.confirm': async (args = {}) => {
      if (!ctx.shopSignup) throw seam('SHOP_SIGNUP_PROVIDER_UNAVAILABLE', 'shop signup is not wired');
      if (!args.address) { require$(args, 'emailRef', 'EMAIL_REF_REQUIRED'); require$(args, 'imapPasswordRef', 'IMAP_PASSWORD_REF_REQUIRED'); }
      return ctx.shopSignup.confirm(require$(args, 'shopId', 'SHOP_ID_REQUIRED'), {
        address: args.address ?? null,
        emailRef: args.emailRef,
        imapPasswordRef: args.imapPasswordRef,
        extraFields: args.extraFields ?? {}
      });
    },

    // ---- Proxies (1:1 sticky pool) -----------------------------------------
    'proxy.status': async (args = {}) => proxyStatus(ctx, { deviceId: args.deviceId }),
    'proxy.assign': async (args = {}) => assignDeviceProxy(ctx, {
      deviceId: require$(args, 'deviceId', 'DEVICE_ID_REQUIRED'), proxyId: args.proxyId, geo: args.geo
    }),
    'proxy.rotate': async (args = {}) => rotateDeviceProxy(ctx, {
      deviceId: require$(args, 'deviceId', 'DEVICE_ID_REQUIRED'), geo: args.geo
    }),

    // ---- Scrape ------------------------------------------------------------
    'scrape.run': async (args = {}) => {
      const platform = require$(args, 'platform', 'PLATFORM_REQUIRED');
      const targetType = require$(args, 'targetType', 'TARGET_TYPE_REQUIRED');
      const target = require$(args, 'target', 'TARGET_REQUIRED');
      if (typeof ctx.dispatchScrape !== 'function') {
        throw Object.assign(new Error('SCRAPE_DISPATCH_UNAVAILABLE: no scrape job dispatcher wired'), { code: 'SCRAPE_DISPATCH_UNAVAILABLE' });
      }
      const jobId = await ctx.dispatchScrape({ platform, targetType, target, params: args.params ?? {} });
      return { enqueued: true, jobId: jobId ?? null, platform, targetType, target };
    },
    'scrape.results': async (args = {}) => {
      const results = await ctx.scrapeResultRepo.listResults(
        { ...(args.platform ? { platform: args.platform } : {}), ...(args.type ? { type: args.type } : {}) },
        { cursor: args.cursor ?? null, limit: args.limit ?? 100 }
      );
      return { results };
    },

    // ---- Intelligence / generation -----------------------------------------
    'scoring.score': async (args = {}) => {
      const subjectType = args.subjectType ?? 'account';
      const features = args.features ?? {};
      const result = subjectType === 'target' ? scoreTarget(features) : scoreAccount(features);
      return { subjectType, subjectId: args.subjectId ?? null, ...result };
    },
    'persona.generate': async (args = {}) => generatePersona({ niche: args.niche, locale: args.locale, seed: args.seed ?? 0 }),
    'verification.rent': async (args = {}) => {
      if (!ctx.verificationProvider) {
        throw Object.assign(new Error('VERIFICATION_PROVIDER_UNAVAILABLE: no verification resource provider wired'), { code: 'VERIFICATION_PROVIDER_UNAVAILABLE' });
      }
      return ctx.verificationProvider.rentNumber({ country: require$(args, 'country', 'COUNTRY_REQUIRED'), service: require$(args, 'service', 'SERVICE_REQUIRED') });
    },

    // ---- Browser sessions (Browserbase-class fleet) ------------------------
    'browser.session.open': async (args = {}) => {
      const backend = browserBackend(args.provider);
      const s = await backend.createSession({ proxy: args.proxy, userAgent: args.userAgent, contextId: args.contextId, geo: args.geo });
      return { sessionId: s.sessionId, cdpUrl: s.cdpUrl, provider: backend.provider ?? args.provider ?? 'own' };
    },
    'browser.session.liveView': async (args = {}) => {
      const backend = browserBackend(args.provider);
      return backend.liveView(require$(args, 'sessionId', 'SESSION_ID_REQUIRED'));
    },
    // Stagehand-style observe→act over the SELECTED browser backend + LLM vendor —
    // the AI login/automation path, callable from every surface. `provider`/`model`
    // pick the LLM; `browserProvider` picks the browser backend.
    'browser.observe': async (args = {}) => {
      const actor = aiActor(args);
      return actor.observe(require$(args, 'sessionId', 'SESSION_ID_REQUIRED'), {
        goal: require$(args, 'goal', 'GOAL_REQUIRED'),
        url: args.url
      });
    },
    'browser.act': async (args = {}) => {
      const actor = aiActor(args);
      return actor.act(require$(args, 'sessionId', 'SESSION_ID_REQUIRED'), {
        goal: require$(args, 'goal', 'GOAL_REQUIRED'),
        url: args.url
      });
    },

    // ---- Reconciliation ----------------------------------------------------
    'reconcile.now': async (args = {}) => {
      const intents = await planForPlatform(ctx, { platform: args.platform, source: args.source });
      return { platform: args.platform, intents };
    },

    // ---- Targets (callable targets database, TZ §3.5/§10.5) ----------------
    // Selector: an explicit id, else the natural (platform,targetType,identifier).
    'target.add': async (args = {}) => {
      const platform = require$(args, 'platform', 'PLATFORM_REQUIRED');
      const targetType = require$(args, 'targetType', 'TARGET_TYPE_REQUIRED');
      const identifier = require$(args, 'identifier', 'IDENTIFIER_REQUIRED');
      const { upserted } = await ctx.targetRepo.upsertMany([
        { platform, targetType, identifier, source: args.source ?? 'manual', status: args.status, score: args.score, metadata: args.metadata }
      ]);
      return { upserted, platform, targetType, identifier };
    },
    'target.import': async (args = {}) => {
      const items = Array.isArray(args.items) ? args.items : [];
      if (!items.length) throw seam('ITEMS_REQUIRED', 'items[] is required');
      const norm = items.map((t, i) => {
        const platform = t.platform ?? args.platform;
        const targetType = t.targetType ?? args.targetType;
        if (!platform || !targetType || !t.identifier) throw seam('INVALID_TARGET_ITEM', `item ${i} needs platform, targetType and identifier`);
        return { platform, targetType, identifier: t.identifier, source: t.source ?? args.source ?? 'import', metadata: t.metadata, score: t.score, status: t.status };
      });
      const { upserted } = await ctx.targetRepo.upsertMany(norm);
      return { imported: norm.length, upserted };
    },
    'target.list': async (args = {}) => {
      const limit = args.limit ?? 100;
      const items = await ctx.targetRepo.page(
        { platform: args.platform, targetType: args.targetType, status: args.status, source: args.source, minScore: args.minScore, tag: args.tag },
        { cursor: args.cursor ?? null, limit }
      );
      return { items, nextCursor: items.length === limit ? items[items.length - 1]._id : null };
    },
    'target.get': async (args = {}) => {
      const target = await ctx.targetRepo.get(targetSelector(args, require$));
      if (!target) throw seam('TARGET_NOT_FOUND', 'no such target');
      return { target };
    },
    'target.score': async (args = {}) => {
      const { score, ...rest } = scoreTarget(args.features ?? {});
      const target = await ctx.targetRepo.patch(targetSelector(args, require$), { score, status: 'enriched' });
      if (!target) throw seam('TARGET_NOT_FOUND', 'no such target');
      return { score, ...rest, target };
    },
    'target.tag': async (args = {}) => {
      const target = await ctx.targetRepo.patch(targetSelector(args, require$), { addTags: args.add ?? [], removeTags: args.remove ?? [] });
      if (!target) throw seam('TARGET_NOT_FOUND', 'no such target');
      return { target };
    },
    'target.status': async (args = {}) => {
      const status = require$(args, 'status', 'STATUS_REQUIRED');
      const target = await ctx.targetRepo.patch(targetSelector(args, require$), { status });
      if (!target) throw seam('TARGET_NOT_FOUND', 'no such target');
      return { target };
    },

    // ---- Observability (domain metrics read-model, TZ §15) ----------------
    'metrics.domain': async (args = {}) => ({ platforms: await domainSnapshot(ctx, { platform: args.platform }) }),
    // SLO alerts + error budget (TZ §15) — evaluated from the live domain
    // snapshot + facade op stats; objectives come from config, never hardcoded.
    'alerts.status': async (args = {}) => evaluateSlos({
      platforms: await domainSnapshot(ctx, { platform: args.platform }),
      dlq: ctx.dlqDepths ?? {},
      spendUsdCents: ctx.spendUsdCents ?? 0,
      ops: ctx.facadeStats?.() ?? { total: 0, errors: 0 },
      circuits: ctx.circuitStates ?? {}
    }, ctx.config?.slo ?? {}),

    // Span-level traces (job → device-op → vendor-call), readable from any surface.
    'trace.recent': async (args = {}) => {
      if (!ctx.tracer?.recentSpans) throw seam('TRACER_UNAVAILABLE', 'tracer not wired');
      return { spans: ctx.tracer.recentSpans({ traceId: args.traceId ?? null, limit: args.limit ?? 50 }) };
    },

    // ---- Compliance (GDPR export / erasure, TZ §14.7) ----------------------
    'compliance.export': async (args = {}) => {
      const accountId = require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED');
      const [account] = await ctx.accountRepo.find({ _id: accountId });
      if (!account) throw seam('ACCOUNT_NOT_FOUND', `account ${accountId} not found`);
      const safe = { ...account }; // subject export — never include secret material
      delete safe.secretRefs;
      delete safe.credentials;
      const scrapeResults = ctx.scrapeResultRepo?.listResults && account.identifier
        ? await ctx.scrapeResultRepo.listResults({ 'data.handle': account.identifier }, { limit: 500 })
        : [];
      return { account: safe, scrapeResults };
    },
    'compliance.erase': async (args = {}) => {
      if (!ctx.gdpr) throw seam('COMPLIANCE_UNAVAILABLE', 'gdpr service not wired');
      const accountId = require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED');
      return ctx.gdpr.deleteAccount(accountId, { identifier: args.identifier ?? null });
    }
  };
}

async function setStatus(ctx, args, status) {
  const id = require$(args, 'campaignId', 'CAMPAIGN_ID_REQUIRED');
  const updated = await ctx.campaignRepo.setCampaignStatus(id, status);
  if (!updated) throw Object.assign(new Error('CAMPAIGN_NOT_FOUND: campaign not found'), { code: 'CAMPAIGN_NOT_FOUND' });
  return { campaignId: id, status: updated.status };
}
