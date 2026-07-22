// Generic PlatformAutomationPort (TZ §9.1) — bridges the domain port to ANY
// platform's @acq/automation driver over a LIVE controller. Not whatsapp-only:
// the platform is a parameter and the driver is resolved from the registry, so
// telegram/discord/facebook/gmail/tiktok/instagram/youtube all work the same
// way. provider (mints controllers), secretResolver (dereferences secretRefs)
// and the registry lookups are INJECTED — this module imports no device backend.
import { getPlatformAdapter } from '@acq/automation';
import { getPlatformCapabilities } from '@acq/platform-registry';

// Fallback probe mapping when a platform's registry stateVocabulary is absent.
const DEFAULT_STATE_TO_PROBE = {
  logged_in: 'online',
  online: 'online',
  banned: 'banned',
  checkpoint: 'checkpointed',
  checkpointed: 'checkpointed',
  logged_out: 'logged_out',
  unknown: 'logged_out'
};

function onlineMethodError(platform) {
  const err = new Error(`ONLINE_METHOD_UNSUPPORTED: platform ${platform} has no login/bringOnline`);
  err.code = 'ONLINE_METHOD_UNSUPPORTED';
  return err;
}

export function createPlatformAutomationAdapter({
  platform,
  provider,
  secretResolver,
  getAdapter = getPlatformAdapter,
  capabilitiesOf = getPlatformCapabilities
} = {}) {
  const driver = getAdapter(platform);
  const controllerFor = (ctx) => provider.createDirectController(ctx.providerDeviceId, ctx.controllerOpts);

  function probeMap() {
    let vocab = {};
    try {
      vocab = capabilitiesOf(platform)?.stateVocabulary ?? {};
    } catch {
      vocab = {};
    }
    return { ...DEFAULT_STATE_TO_PROBE, ...vocab };
  }

  return {
    async bringOnline(ctx) {
      if (typeof driver.login !== 'function') {
        // Platforms without a login flow (discord/facebook/gmail) fail safe with
        // a coded seam — never a pretend success.
        throw onlineMethodError(platform);
      }
      const controller = controllerFor(ctx);
      const sessionRef = ctx.account?.secretRefs?.session;
      const session = sessionRef ? await secretResolver.resolve(sessionRef) : undefined;
      const account = { ...ctx.account, secretRefs: { ...(ctx.account?.secretRefs ?? {}), session } };
      const result = await driver.login(controller, account, ctx.opts ?? {});
      return { ok: Boolean(result?.ok ?? true) };
    },

    async runAction(ctx, action) {
      const controller = controllerFor(ctx);
      const result = await driver.runAction(controller, action, ctx.account ?? {}, ctx.opts ?? {});
      return { ok: Boolean(result?.ok), banned: result?.banned, checkpointed: result?.checkpointed, ...result };
    },

    async warmup(ctx) {
      if (typeof driver.warmup !== 'function') return { ok: true, skipped: 'no-warmup' };
      const controller = controllerFor(ctx);
      return driver.warmup(controller, ctx.account ?? {}, ctx.opts ?? {});
    },

    async setupProfile(ctx, persona) {
      if (typeof driver.setupProfile !== 'function') return { ok: true, skipped: 'no-setup-profile' };
      const controller = controllerFor(ctx);
      return driver.setupProfile(controller, persona, ctx.opts ?? {});
    },

    async probeState(ctx) {
      const controller = controllerFor(ctx);
      const hc = await driver.healthCheck(controller, ctx.account ?? {}, ctx.opts ?? {});
      const map = probeMap();
      return map[hc?.state] || 'logged_out';
    }
  };
}
