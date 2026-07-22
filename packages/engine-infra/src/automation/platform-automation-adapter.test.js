import { createPlatformAutomationAdapter } from './platform-automation-adapter.js';

// Fake platform driver + provider + secretResolver (no real device).
function build({ driver, capabilities } = {}) {
  const controllerCalls = [];
  const provider = {
    createDirectController: (id) => {
      controllerCalls.push(id);
      return { __device: id };
    }
  };
  const secretResolver = { resolve: async (ref) => `resolved:${ref}` };
  const getAdapter = () => driver;
  const capabilitiesOf = () => capabilities ?? { stateVocabulary: {} };
  return {
    controllerCalls,
    adapter: createPlatformAutomationAdapter({
      platform: 'telegram',
      provider,
      secretResolver,
      getAdapter,
      capabilitiesOf
    })
  };
}

describe('createPlatformAutomationAdapter (generic, any platform)', () => {
  it('bringOnline resolves the session and delegates to the driver login', async () => {
    const seen = [];
    const driver = { login: async (c, account) => { seen.push({ c, account }); return { ok: true }; } };
    const { adapter } = build({ driver });
    const res = await adapter.bringOnline({ providerDeviceId: 'dev1', account: { secretRefs: { session: 'vault:s1' } } });
    expect(res.ok).toBe(true);
    expect(seen[0].c).toEqual({ __device: 'dev1' });
    expect(seen[0].account.secretRefs.session).toBe('resolved:vault:s1');
  });

  it('bringOnline surfaces a coded seam when the driver has no login', async () => {
    const { adapter } = build({ driver: { platform: 'discord', runAction: async () => ({}) } });
    await expect(adapter.bringOnline({ providerDeviceId: 'dev1', account: {} })).rejects.toMatchObject({
      code: 'ONLINE_METHOD_UNSUPPORTED'
    });
  });

  it('runAction delegates and normalizes {ok,banned,checkpointed}', async () => {
    const driver = { runAction: async (_c, action) => ({ ok: false, banned: true, echo: action.type }) };
    const { adapter } = build({ driver });
    const res = await adapter.runAction(
      { providerDeviceId: 'dev1', account: {} },
      { type: 'join', target: '@x' }
    );
    expect(res).toMatchObject({ ok: false, banned: true });
  });

  it('probeState maps healthCheck state via the registry stateVocabulary', async () => {
    const driver = { healthCheck: async () => ({ state: 'logged_in' }) };
    const { adapter } = build({
      driver,
      capabilities: { stateVocabulary: { logged_in: 'online', banned: 'banned' } }
    });
    await expect(adapter.probeState({ providerDeviceId: 'dev1', account: {} })).resolves.toBe('online');
  });

  it('warmup/setupProfile delegate when the driver supports them', async () => {
    const driver = {
      warmup: async () => ({ ok: true, level: 1 }),
      setupProfile: async (_c, persona) => ({ ok: true, name: persona.displayName })
    };
    const { adapter } = build({ driver });
    await expect(adapter.warmup({ providerDeviceId: 'd', account: {} })).resolves.toMatchObject({ ok: true });
    await expect(
      adapter.setupProfile({ providerDeviceId: 'd', account: {} }, { displayName: 'Bob' })
    ).resolves.toMatchObject({ name: 'Bob' });
  });
});
