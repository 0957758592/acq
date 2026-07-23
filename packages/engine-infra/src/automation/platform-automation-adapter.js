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

  function capsOf() {
    try {
      return capabilitiesOf(platform) ?? {};
    } catch {
      return {};
    }
  }
  function probeMap() {
    return { ...DEFAULT_STATE_TO_PROBE, ...(capsOf().stateVocabulary ?? {}) };
  }

  // Verify-by-fact foreground guard (shared by probe + action confirmation):
  // true if the platform's OWN app is the foreground app, or if we cannot tell.
  // A KNOWN mismatch (a different app is foreground, or the app isn't installed)
  // returns false so callers never trust a reading/result off the wrong screen.
  async function foregroundMatches(controller) {
    const expectedPkg = capsOf().appPackage;
    if (!expectedPkg || typeof controller.getCurrentPackage !== 'function') return true;
    const foreground = await controller.getCurrentPackage().catch(() => '');
    return !foreground || foreground === expectedPkg;
  }

  // Verify-by-fact probe: run the driver health check, then confirm the app is
  // foreground before trusting a logged-in reading (else report logged_out).
  async function probeStateImpl(ctx) {
    const controller = controllerFor(ctx);
    const hc = await driver.healthCheck(controller, ctx.account ?? {}, ctx.opts ?? {});
    if (!(await foregroundMatches(controller))) return 'logged_out';
    return probeMap()[hc?.state] || 'logged_out';
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
      if (result?.banned) return { ok: false, banned: true };
      if (result?.checkpointed) return { ok: false, checkpointed: true };
      // Verify-by-fact: when the driver can report health, don't trust login's
      // self-report — confirm the account is actually online on-device (this also
      // catches an optimistic {ok:true} from a login that didn't really log in).
      if (typeof driver.healthCheck === 'function') {
        const state = await probeStateImpl({ ...ctx, account });
        if (state === 'banned') return { ok: false, banned: true };
        if (state === 'checkpointed') return { ok: false, checkpointed: true };
        return { ok: state === 'online' };
      }
      return { ok: Boolean(result?.ok ?? true) };
    },

    async runAction(ctx, action) {
      const controller = controllerFor(ctx);
      const result = await driver.runAction(controller, action, ctx.account ?? {}, ctx.opts ?? {});
      const normalized = { ...result, ok: Boolean(result?.ok), banned: result?.banned, checkpointed: result?.checkpointed };
      // Verify-by-fact (§9.5): an action counts as done ONLY if the platform's own
      // app was actually foreground — otherwise the driver acted on/read the wrong
      // screen (or the app isn't installed) and the "success" is not real.
      if (normalized.ok && !normalized.banned && !normalized.checkpointed && !(await foregroundMatches(controller))) {
        return { ...normalized, ok: false, confirmed: false, reason: 'ACTION_NOT_CONFIRMED' };
      }
      return normalized;
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
      return probeStateImpl(ctx);
    }
  };
}
