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
  selectorProvider = null,
  tracer = null,
  getAdapter = getPlatformAdapter,
  capabilitiesOf = getPlatformCapabilities
} = {}) {
  const driver = getAdapter(platform);
  const controllerFor = (ctx) => provider.createDirectController(ctx.providerDeviceId, ctx.controllerOpts);
  // Resolve operator on-device selector overrides for this platform (tuned to
  // the live app build via device.selectors.*); merged into driver opts so the
  // shared login/action runners union them over their built-in seeds.
  async function optsWithSelectors(ctx) {
    const base = ctx.opts ?? {};
    if (!selectorProvider?.forPlatform) return base;
    const selectors = await selectorProvider.forPlatform(platform).catch(() => ({}));
    return { ...base, selectors: { ...(base.selectors ?? {}), ...(selectors ?? {}) } };
  }

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

  // Generic dispatch: a driver exposes EITHER a uniform runAction(action) OR a
  // named method per action type (report / publish / follow / like / …). Map
  // action.type -> the driver method so EVERY platform's actions are reachable
  // through the generic engine.action consumer (no TypeError, no whatsapp-only
  // path). An unsupported action is an honest coded seam.
  async function runActionImpl(ctx, action) {
    const controller = controllerFor(ctx);
    const method = typeof driver.runAction === 'function' ? 'runAction' : action?.type;
    if (typeof driver[method] !== 'function') {
      throw Object.assign(new Error(`ACTION_METHOD_UNSUPPORTED: ${platform} has no '${action?.type}' action`), { code: 'ACTION_METHOD_UNSUPPORTED' });
    }
    const result = await driver[method](controller, action, ctx.account ?? {}, await optsWithSelectors(ctx));
    const normalized = { ...result, ok: Boolean(result?.ok), banned: result?.banned, checkpointed: result?.checkpointed };
    // Verify-by-fact (§9.5): an action counts as done ONLY if the platform's own
    // app was actually foreground — otherwise the driver acted on/read the wrong
    // screen (or the app isn't installed) and the "success" is not real.
    if (normalized.ok && !normalized.banned && !normalized.checkpointed && !(await foregroundMatches(controller))) {
      return { ...normalized, ok: false, confirmed: false, reason: 'ACTION_NOT_CONFIRMED' };
    }
    return normalized;
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
      const sr = ctx.account?.secretRefs ?? {};
      // Dereference the vaulted secrets a login needs: session (session-import
      // online) and username/password/email (credential login). Any DB-level
      // credentials win; vaulted refs fill the rest. Generic across platforms.
      const [session, username, password, email] = await Promise.all([
        sr.session ? secretResolver.resolve(sr.session) : undefined,
        sr.username ? secretResolver.resolve(sr.username) : undefined,
        sr.password ? secretResolver.resolve(sr.password) : undefined,
        sr.email ? secretResolver.resolve(sr.email) : undefined
      ]);
      const credentials = { ...(ctx.account?.credentials ?? {}) };
      if (username && credentials.username == null) credentials.username = username;
      if (email && credentials.email == null) credentials.email = email;
      if (password && credentials.password == null) credentials.password = password;
      const account = { ...ctx.account, credentials, secretRefs: { ...sr, session } };
      const result = await driver.login(controller, account, await optsWithSelectors({ ...ctx, account }));
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
      // device-op span (TZ §15): joins the operation's trace via correlationId,
      // so job → device-op → vendor-call reads as one connected trace.
      if (tracer?.withSpan) {
        return tracer.withSpan(
          'device.runAction',
          { traceId: ctx.correlationId, attributes: { platform, action: action?.type, deviceId: ctx.providerDeviceId } },
          () => runActionImpl(ctx, action)
        );
      }
      return runActionImpl(ctx, action);
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
