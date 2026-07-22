import { planForPlatform } from '../../engine/src/snapshot.js';
import { acquireHandler } from '../../engine/src/handlers/acquire.handler.js';
import { applyAccountTransition, reassignAccount } from '../../engine/src/services/account-lifecycle.js';
import { enrollDevice } from '../../engine/src/services/device-enroll.js';

function require$(args, field, code) {
  const v = args?.[field];
  if (v === undefined || v === null || v === '') {
    throw Object.assign(new Error(`${code}: ${field} is required`), { code });
  }
  return v;
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

    // ---- Campaigns ---------------------------------------------------------
    'campaign.create': async (args = {}) => {
      require$(args, 'platform', 'PLATFORM_REQUIRED');
      require$(args, 'actionType', 'ACTION_TYPE_REQUIRED');
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
    'campaign.pause': async (args = {}) => setStatus(ctx, args, 'paused'),
    'campaign.resume': async (args = {}) => setStatus(ctx, args, 'active'),
    'campaign.stop': async (args = {}) => setStatus(ctx, args, 'stopped'),

    // ---- Accounts ----------------------------------------------------------
    'account.status': async (args = {}) => {
      const rows = await ctx.accountRepo.find(args.accountId ? { _id: args.accountId } : { platform: args.platform });
      return { accounts: rows };
    },
    'account.retire': async (args = {}) => applyAccountTransition(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'), to: 'retired' }),
    'account.cooldown': async (args = {}) => applyAccountTransition(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'), to: 'cooldown' }),
    'account.resume': async (args = {}) => applyAccountTransition(ctx, { accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'), to: 'online' }),
    'account.reassign': async (args = {}) => reassignAccount(ctx, {
      accountId: require$(args, 'accountId', 'ACCOUNT_ID_REQUIRED'),
      deviceId: require$(args, 'deviceId', 'DEVICE_ID_REQUIRED')
    }),

    // ---- Reconciliation ----------------------------------------------------
    'reconcile.now': async (args = {}) => {
      const intents = await planForPlatform(ctx, { platform: args.platform, source: args.source });
      return { platform: args.platform, intents };
    }
  };
}

async function setStatus(ctx, args, status) {
  const id = require$(args, 'campaignId', 'CAMPAIGN_ID_REQUIRED');
  const updated = await ctx.campaignRepo.setCampaignStatus(id, status);
  if (!updated) throw Object.assign(new Error('CAMPAIGN_NOT_FOUND: campaign not found'), { code: 'CAMPAIGN_NOT_FOUND' });
  return { campaignId: id, status: updated.status };
}
