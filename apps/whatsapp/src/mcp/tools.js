// MCP tool descriptors — THIN use-case delegation.
//
// buildTools(ctx) returns an array of { name, description, inputSchema, yupSchema, handler }.
// Each handler validates its args (yup, unknown fields rejected) then delegates to a `ctx`
// port. There is NO error mapping here: Task 7's core wraps every handler in a
// try/catch -> toMcpError so coded domain errors and unexpected errors are translated at
// the transport boundary (once), not per-tool.
//
// `inputSchema` is a hand-authored plain JSON Schema (for MCP tools/list); `yupSchema` is
// the runtime validator. They are kept in lockstep by hand.
import { domainError, transition, reconcile, REPORT_STRATEGIES } from '@acq/whatsapp';
import { bareClock } from '@acq/whatsapp-infra';
import { buildSnapshot } from '../snapshot.js';
import { dispatchIntents } from '../intents.js';
import { toDomainAccount } from '../handlers/map.js';
import {
  poolBuySchema,
  deviceEnrollSchema,
  deviceQueueGetSchema,
  campaignCreateSchema,
  campaignIdSchema,
  accountRetireSchema,
  emptySchema,
  validateArgs
} from './schemas.js';

const emptyJsonSchema = { type: 'object', properties: {}, additionalProperties: false };
const idJsonSchema = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
  additionalProperties: false
};

export function buildTools(ctx) {
  return [
    {
      name: 'pool.status',
      description: 'Current pool availability, threshold, and autobuy flag.',
      inputSchema: emptyJsonSchema,
      yupSchema: emptySchema,
      handler: async (args) => {
        await validateArgs(emptySchema, args);
        return {
          available: await ctx.accountRepo.countAvailable(),
          threshold: ctx.config.poolThreshold,
          autobuyEnabled: ctx.config.autobuyEnabled
        };
      }
    },
    {
      name: 'pool.buy',
      description: 'Dispatch a job to buy N accounts into the pool.',
      inputSchema: {
        type: 'object',
        properties: { quantity: { type: 'integer', minimum: 1 } },
        required: ['quantity'],
        additionalProperties: false
      },
      yupSchema: poolBuySchema,
      handler: async (args) => {
        const v = await validateArgs(poolBuySchema, args);
        return ctx.jobDispatcher.dispatch(
          'whatsapp.buy',
          { jobName: 'buy-accounts', payload: { quantity: v.quantity } },
          { idempotencyKey: `mcp-buy:${v.quantity}:${ctx.clock.now().toISOString()}` }
        );
      }
    },
    {
      name: 'device.enroll',
      description: 'Ensure a device has a queue at the given target depth.',
      inputSchema: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' },
          targetDepth: { type: 'integer', minimum: 1 }
        },
        required: ['deviceId', 'targetDepth'],
        additionalProperties: false
      },
      yupSchema: deviceEnrollSchema,
      handler: async (args) => {
        const v = await validateArgs(deviceEnrollSchema, args);
        // Provision (install WhatsApp team-APK + proxy) BEFORE creating the queue.
        // A coded provisioning failure (e.g. WHATSAPP_TEAM_APP_NOT_FOUND) aborts the
        // tool fail-safe, so we never enqueue work for a device that cannot report.
        await ctx.deviceRegistration.ensureReady({ providerDeviceId: v.deviceId });
        return ctx.deviceQueueRepo.ensureQueue(v.deviceId, v.targetDepth);
      }
    },
    {
      name: 'device.queue.get',
      description: 'Read a device queue by deviceId.',
      inputSchema: {
        type: 'object',
        properties: { deviceId: { type: 'string' } },
        required: ['deviceId'],
        additionalProperties: false
      },
      yupSchema: deviceQueueGetSchema,
      handler: async (args) => {
        const v = await validateArgs(deviceQueueGetSchema, args);
        return ctx.deviceQueueRepo.find(v.deviceId);
      }
    },
    {
      name: 'campaign.create',
      description: 'Create a report campaign for a set of targets and a strategy.',
      inputSchema: {
        type: 'object',
        properties: {
          targets: { type: 'array', items: { type: 'string' }, minItems: 1 },
          strategy: { type: 'string', enum: REPORT_STRATEGIES }
        },
        required: ['targets', 'strategy'],
        additionalProperties: false
      },
      yupSchema: campaignCreateSchema,
      handler: async (args) => {
        const v = await validateArgs(campaignCreateSchema, args);
        return ctx.reportRepo.createCampaign({ targets: v.targets, strategy: v.strategy });
      }
    },
    {
      name: 'campaign.status',
      description: 'Read a campaign by id.',
      inputSchema: idJsonSchema,
      yupSchema: campaignIdSchema,
      handler: async (args) => {
        const v = await validateArgs(campaignIdSchema, args);
        return ctx.reportRepo.findCampaign(v.id);
      }
    },
    {
      name: 'campaign.pause',
      description: 'Pause an active campaign.',
      inputSchema: idJsonSchema,
      yupSchema: campaignIdSchema,
      handler: async (args) => {
        const v = await validateArgs(campaignIdSchema, args);
        return ctx.reportRepo.setCampaignStatus(v.id, 'paused');
      }
    },
    {
      name: 'campaign.resume',
      description: 'Resume a paused campaign.',
      inputSchema: idJsonSchema,
      yupSchema: campaignIdSchema,
      handler: async (args) => {
        const v = await validateArgs(campaignIdSchema, args);
        return ctx.reportRepo.setCampaignStatus(v.id, 'active');
      }
    },
    {
      name: 'campaign.stop',
      description: 'Stop a campaign permanently.',
      inputSchema: idJsonSchema,
      yupSchema: campaignIdSchema,
      handler: async (args) => {
        const v = await validateArgs(campaignIdSchema, args);
        return ctx.reportRepo.setCampaignStatus(v.id, 'stopped');
      }
    },
    {
      name: 'account.retire',
      description: 'Retire an account (terminal transition).',
      inputSchema: idJsonSchema,
      yupSchema: accountRetireSchema,
      handler: async (args) => {
        const v = await validateArgs(accountRetireSchema, args);
        const [doc] = await ctx.accountRepo.find({ _id: v.id });
        if (!doc) throw domainError('NOT_FOUND', `account ${v.id} not found`);
        const acct = transition(toDomainAccount(doc), 'retired', { clock: bareClock(ctx.clock) });
        await ctx.accountRepo.save(acct);
        return { ok: true, id: v.id };
      }
    },
    {
      name: 'reconcile.now',
      description: 'Force a reconcile tick: project a snapshot and dispatch resulting intents.',
      inputSchema: emptyJsonSchema,
      yupSchema: emptySchema,
      handler: async (args) => {
        await validateArgs(emptySchema, args);
        await dispatchIntents(reconcile(await buildSnapshot(ctx)), {
          jobDispatcher: ctx.jobDispatcher,
          clock: ctx.clock
        });
        return { ok: true };
      }
    }
  ];
}
