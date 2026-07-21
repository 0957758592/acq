// createWhatsappAutomationAdapter — implements the domain WhatsappAutomationPort
// ({ bringOnline, reportTarget, probeState }) by bridging it to the on-device
// @acq/automation whatsapp adapter driven over a LIVE controller.
//
// The `provider` (mints direct controllers) and `secretResolver` (dereferences
// secretRefs) are INJECTED — this module never imports @acq/device-control or
// a concrete secrets backend. `getAdapter` defaults to the real registry but is
// injectable so tests can isolate the BRIDGE from the ui-flows.
import { getPlatformAdapter } from '@acq/automation';

// The automation adapter's healthCheck reports the ui-flows state vocabulary
// (logged_in | banned | logged_out | unknown). The port speaks a narrower
// vocabulary — map into it, defaulting anything unrecognized to logged_out.
const STATE_TO_PROBE = {
  logged_in: 'online',
  banned: 'banned',
  logged_out: 'logged_out',
  unknown: 'logged_out'
};

export function createWhatsappAutomationAdapter({
  provider,
  secretResolver,
  getAdapter = getPlatformAdapter,
  config = {}
} = {}) {
  const adapter = getAdapter('whatsapp');
  const controllerFor = (ctx) => provider.createDirectController(ctx.providerDeviceId);

  return {
    // bringOnline resolves the account's session secret (if any) and delegates
    // to the adapter's login = session-import seam. That seam is currently
    // guarded (throws WHATSAPP_SESSION_IMPORT_UNVERIFIED) — the error is NOT
    // caught here; it MUST propagate to the caller.
    async bringOnline(ctx) {
      const controller = controllerFor(ctx);
      const sessionRef = ctx.account?.secretRefs?.session;
      const session = sessionRef ? await secretResolver.resolve(sessionRef) : undefined;
      const result = await adapter.login(controller, { secretRefs: { session } });
      return { ok: Boolean(result?.ok ?? true) };
    },

    async reportTarget(ctx, target) {
      const controller = controllerFor(ctx);
      const result = await adapter.report(controller, {
        targetMsisdn: target,
        alsoBlock: config.alsoBlock ?? false
      });
      return { ok: Boolean(result?.ok), banned: result?.banned };
    },

    async probeState(ctx) {
      const controller = controllerFor(ctx);
      const hc = await adapter.healthCheck(controller);
      return STATE_TO_PROBE[hc?.state] || 'logged_out';
    }
  };
}
