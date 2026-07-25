import { planForPlatform } from '../../engine/src/snapshot.js';
import { acquireHandler } from '../../engine/src/handlers/acquire.handler.js';
import { applyAccountTransition, reassignAccount } from '../../engine/src/services/account-lifecycle.js';
import { enrollDevice } from '../../engine/src/services/device-enroll.js';
import { probeAccount, runAccountAction } from '../../engine/src/services/account-ops.js';
import { assertSupportedAction } from '../../engine/src/services/action-support.js';
import { proxyStatus, assignDeviceProxy, rotateDeviceProxy } from '../../engine/src/services/proxy-ops.js';
import { scanShop } from '../../engine/src/services/scan-shop.js';
import { domainSnapshot } from '../../engine/src/services/domain-snapshot.js';
import { evaluateSlos } from '@acq/core/observability/slo';
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

// Wires facade operations to real application logic over the engine context
// (TZ §11.1). ONE definition per operation, exposed identically across every
// surface (MCP/REST/CLI/SSE/webhooks) via the facade. Generic across platforms —
// nothing here branches on a specific messenger. Operations without a handler
// fall through to NOT_IMPLEMENTED as their subsystems land.
export function buildUseCases(ctx) {
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
      const filter = { ...(args.status ? { status: args.status } : {}), ...(args.provider ? { provider: args.provider } : {}) };
      return { devices: ctx.deviceModel ? await ctx.deviceModel.find(filter).lean() : [] };
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
      const filter = args.accountId ? { _id: args.accountId } : args.platform ? { platform: args.platform } : {};
      const rows = await ctx.accountRepo.find(filter);
      return { accounts: rows };
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
    'shop.scan': async (args = {}) => scanShop(ctx, { shopUrl: require$(args, 'shopUrl', 'SHOP_URL_REQUIRED'), dryRun: Boolean(args.dryRun) }),
    // Register AN ACCOUNT at a shop via an email identity (credentials are REFS,
    // never plaintext). Absent wiring is an honest coded seam.
    'shop.signup': async (args = {}) => {
      if (!ctx.shopSignup) throw seam('SHOP_SIGNUP_PROVIDER_UNAVAILABLE', 'shop signup is not wired');
      return ctx.shopSignup.signup(require$(args, 'shopId', 'SHOP_ID_REQUIRED'), {
        emailRef: require$(args, 'emailRef', 'EMAIL_REF_REQUIRED'),
        passwordRef: require$(args, 'passwordRef', 'PASSWORD_REF_REQUIRED'),
        usernameRef: args.usernameRef,
        extraFields: args.extraFields ?? {}
      });
    },
    'shop.signup.confirm': async (args = {}) => {
      if (!ctx.shopSignup) throw seam('SHOP_SIGNUP_PROVIDER_UNAVAILABLE', 'shop signup is not wired');
      return ctx.shopSignup.confirm(require$(args, 'shopId', 'SHOP_ID_REQUIRED'), {
        emailRef: require$(args, 'emailRef', 'EMAIL_REF_REQUIRED'),
        imapPasswordRef: require$(args, 'imapPasswordRef', 'IMAP_PASSWORD_REF_REQUIRED'),
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
      if (!ctx.browserProvider) throw seam('BROWSER_PROVIDER_UNAVAILABLE', 'no browser provider wired');
      const s = await ctx.browserProvider.createSession({ proxy: args.proxy, userAgent: args.userAgent, contextId: args.contextId, geo: args.geo });
      return { sessionId: s.sessionId, cdpUrl: s.cdpUrl };
    },
    'browser.session.liveView': async (args = {}) => {
      if (!ctx.browserProvider) throw seam('BROWSER_PROVIDER_UNAVAILABLE', 'no browser provider wired');
      return ctx.browserProvider.liveView(require$(args, 'sessionId', 'SESSION_ID_REQUIRED'));
    },

    // ---- Reconciliation ----------------------------------------------------
    'reconcile.now': async (args = {}) => {
      const intents = await planForPlatform(ctx, { platform: args.platform, source: args.source });
      return { platform: args.platform, intents };
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
