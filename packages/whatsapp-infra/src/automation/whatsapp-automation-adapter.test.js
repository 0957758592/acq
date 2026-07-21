import { domainError } from '@acq/whatsapp';

import { createWhatsappAutomationAdapter } from './whatsapp-automation-adapter.js';

// Sentinel controller returned by the fake provider. Identity-compared in the
// assertions so we can prove the adapter forwards THIS controller to the
// injected whatsapp adapter's methods.
const CONTROLLER = Symbol('controller');

// DI-fake provider recording every createDirectController call.
function fakeProvider() {
  const calls = { createDirectController: [] };
  return {
    calls,
    createDirectController(...args) {
      calls.createDirectController.push(args);
      return CONTROLLER;
    }
  };
}

// DI-fake secretResolver recording every resolve call, returning a fixed secret.
function fakeSecretResolver() {
  const calls = { resolve: [] };
  return {
    calls,
    async resolve(...args) {
      calls.resolve.push(args);
      return 'resolved-session';
    }
  };
}

// Stub whatsapp adapter recording calls; `impl` overrides each method's result.
// Isolates the BRIDGE from the real ui-flows.
function stubAdapter(impl = {}) {
  const calls = { login: [], healthCheck: [], report: [] };
  const adapter = {
    platform: 'whatsapp',
    async login(...args) {
      calls.login.push(args);
      if (impl.login) return impl.login(...args);
      return { ok: true };
    },
    async healthCheck(...args) {
      calls.healthCheck.push(args);
      if (impl.healthCheck) return impl.healthCheck(...args);
      return { state: 'logged_in' };
    },
    async report(...args) {
      calls.report.push(args);
      if (impl.report) return impl.report(...args);
      return { ok: true };
    }
  };
  return { adapter, calls };
}

// getAdapter factory that returns the given stub for 'whatsapp'.
function fakeGetAdapter(stub) {
  return (platform) => {
    if (platform !== 'whatsapp') throw new Error(`unexpected platform ${platform}`);
    return stub;
  };
}

const ctx = {
  providerDeviceId: 'dev1',
  account: { secretRefs: { session: 'keychain:wa-1' } }
};

describe('whatsappAutomationAdapter', () => {
  describe('probeState', () => {
    it('maps logged_in -> online (and creates a direct controller for the device)', async () => {
      const provider = fakeProvider();
      const secretResolver = fakeSecretResolver();
      const { adapter } = stubAdapter({ healthCheck: async () => ({ state: 'logged_in' }) });
      const port = createWhatsappAutomationAdapter({
        provider,
        secretResolver,
        getAdapter: fakeGetAdapter(adapter)
      });

      await expect(port.probeState(ctx)).resolves.toBe('online');
      expect(provider.calls.createDirectController).toEqual([['dev1']]);
    });

    it('maps banned -> banned', async () => {
      const { adapter } = stubAdapter({ healthCheck: async () => ({ state: 'banned' }) });
      const port = createWhatsappAutomationAdapter({
        provider: fakeProvider(),
        secretResolver: fakeSecretResolver(),
        getAdapter: fakeGetAdapter(adapter)
      });

      await expect(port.probeState(ctx)).resolves.toBe('banned');
    });

    it('maps unknown -> logged_out', async () => {
      const { adapter } = stubAdapter({ healthCheck: async () => ({ state: 'unknown' }) });
      const port = createWhatsappAutomationAdapter({
        provider: fakeProvider(),
        secretResolver: fakeSecretResolver(),
        getAdapter: fakeGetAdapter(adapter)
      });

      await expect(port.probeState(ctx)).resolves.toBe('logged_out');
    });
  });

  describe('reportTarget', () => {
    it('forwards the target + alsoBlock and returns { ok:true, banned:undefined }', async () => {
      const { adapter, calls } = stubAdapter({ report: async () => ({ ok: true }) });
      const port = createWhatsappAutomationAdapter({
        provider: fakeProvider(),
        secretResolver: fakeSecretResolver(),
        getAdapter: fakeGetAdapter(adapter)
      });

      await expect(port.reportTarget(ctx, '+491700000001')).resolves.toEqual({
        ok: true,
        banned: undefined
      });
      expect(calls.report).toEqual([
        [CONTROLLER, { targetMsisdn: '+491700000001', alsoBlock: false }]
      ]);
    });

    it('propagates ok:false + banned:true from the adapter', async () => {
      const { adapter } = stubAdapter({ report: async () => ({ ok: false, banned: true }) });
      const port = createWhatsappAutomationAdapter({
        provider: fakeProvider(),
        secretResolver: fakeSecretResolver(),
        getAdapter: fakeGetAdapter(adapter)
      });

      await expect(port.reportTarget(ctx, '+491700000001')).resolves.toEqual({
        ok: false,
        banned: true
      });
    });
  });

  describe('bringOnline', () => {
    it('resolves the session secret and passes it to login, returning { ok:true }', async () => {
      const secretResolver = fakeSecretResolver();
      const { adapter, calls } = stubAdapter({ login: async () => ({ ok: true }) });
      const port = createWhatsappAutomationAdapter({
        provider: fakeProvider(),
        secretResolver,
        getAdapter: fakeGetAdapter(adapter)
      });

      await expect(port.bringOnline(ctx)).resolves.toEqual({ ok: true });
      expect(secretResolver.calls.resolve).toEqual([['keychain:wa-1']]);
      expect(calls.login).toEqual([
        [CONTROLLER, { secretRefs: { session: 'resolved-session' } }]
      ]);
    });

    it('does NOT swallow the guarded seam error (WHATSAPP_SESSION_IMPORT_UNVERIFIED)', async () => {
      const { adapter } = stubAdapter({
        login: async () => {
          throw domainError('WHATSAPP_SESSION_IMPORT_UNVERIFIED', 'x');
        }
      });
      const port = createWhatsappAutomationAdapter({
        provider: fakeProvider(),
        secretResolver: fakeSecretResolver(),
        getAdapter: fakeGetAdapter(adapter)
      });

      await expect(port.bringOnline(ctx)).rejects.toThrow('WHATSAPP_SESSION_IMPORT_UNVERIFIED');
    });
  });
});
