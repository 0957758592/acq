import { planForPlatform } from '../../engine/src/snapshot.js';

// Wires facade operations to real application logic over the engine context
// (TZ §11.1). Operations without a handler here fall through to NOT_IMPLEMENTED
// in the facade — they are added as their subsystems land.
export function buildUseCases(ctx) {
  return {
    'pool.status': async (args = {}) => {
      const platform = args.platform;
      const source = args.source ?? 'purchase';
      const available = await ctx.accountRepo.countAvailable({ platform, source });
      return { platform, source, available };
    },
    'account.status': async (args = {}) => {
      const rows = await ctx.accountRepo.find(
        args.accountId ? { _id: args.accountId } : { platform: args.platform }
      );
      return { accounts: rows };
    },
    'reconcile.now': async (args = {}) => {
      const intents = await planForPlatform(ctx, { platform: args.platform, source: args.source });
      return { platform: args.platform, intents };
    }
  };
}
