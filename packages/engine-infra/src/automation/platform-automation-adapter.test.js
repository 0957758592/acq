import { createPlatformAutomationAdapter } from './platform-automation-adapter.js';

// Fake platform driver + provider + secretResolver (no real device).
function build({ driver, capabilities, controller } = {}) {
  const controllerCalls = [];
  const provider = {
    createDirectController: (id) => {
      controllerCalls.push(id);
      return { __device: id, ...(controller ?? {}) };
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

  it('runAction dispatches to a NAMED driver method when the driver has no generic runAction (report/publish/…)', async () => {
    const seen = [];
    const driver = { report: async (c, action, account, opts) => { seen.push({ action, opts }); return { ok: true, reported: true }; } };
    const { adapter } = build({ driver });
    const res = await adapter.runAction({ providerDeviceId: 'd', account: { id: 'a1' }, opts: { actor: 'x' } }, { type: 'report', target: '+1555' });
    expect(res).toMatchObject({ ok: true, reported: true });
    expect(seen[0].action).toEqual({ type: 'report', target: '+1555' });
  });

  it('runAction fails safe with ACTION_METHOD_UNSUPPORTED when neither runAction nor the named method exists', async () => {
    const driver = { publish: async () => ({ ok: true }) }; // has publish, but we call follow
    const { adapter } = build({ driver });
    await expect(adapter.runAction({ providerDeviceId: 'd', account: {} }, { type: 'follow', target: '@x' }))
      .rejects.toMatchObject({ code: 'ACTION_METHOD_UNSUPPORTED' });
  });

  it('runAction downgrades a claimed success to ACTION_NOT_CONFIRMED when the app is NOT foreground', async () => {
    const driver = { runAction: async () => ({ ok: true, echo: 'view' }) };
    const { adapter } = build({
      driver,
      capabilities: { appPackage: 'org.telegram.messenger', stateVocabulary: {} },
      controller: { getCurrentPackage: async () => 'com.other.app' }
    });
    const res = await adapter.runAction({ providerDeviceId: 'd', account: {} }, { type: 'view', target: '@t' });
    expect(res).toMatchObject({ ok: false, reason: 'ACTION_NOT_CONFIRMED' });
  });

  it('runAction keeps a confirmed success when the platform app IS foreground', async () => {
    const driver = { runAction: async () => ({ ok: true }) };
    const { adapter } = build({
      driver,
      capabilities: { appPackage: 'org.telegram.messenger' },
      controller: { getCurrentPackage: async () => 'org.telegram.messenger' }
    });
    const res = await adapter.runAction({ providerDeviceId: 'd', account: {} }, { type: 'view', target: '@t' });
    expect(res.ok).toBe(true);
  });

  it('runAction passes a banned result through regardless of foreground', async () => {
    const driver = { runAction: async () => ({ ok: false, banned: true }) };
    const { adapter } = build({
      driver,
      capabilities: { appPackage: 'x' },
      controller: { getCurrentPackage: async () => 'y' }
    });
    const res = await adapter.runAction({ providerDeviceId: 'd', account: {} }, { type: 'view', target: '@t' });
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

  it('probeState refuses a logged_in reading when the platform app is NOT foreground (no false online)', async () => {
    const driver = { healthCheck: async () => ({ state: 'logged_in' }) };
    const { adapter } = build({
      driver,
      capabilities: { appPackage: 'org.telegram.messenger', stateVocabulary: { logged_in: 'online' } },
      controller: { getCurrentPackage: async () => 'com.instagram.android' } // a DIFFERENT app is foreground
    });
    await expect(adapter.probeState({ providerDeviceId: 'dev1', account: {} })).resolves.toBe('logged_out');
  });

  it('probeState trusts a logged_in reading when the platform app IS foreground', async () => {
    const driver = { healthCheck: async () => ({ state: 'logged_in' }) };
    const { adapter } = build({
      driver,
      capabilities: { appPackage: 'org.telegram.messenger', stateVocabulary: { logged_in: 'online' } },
      controller: { getCurrentPackage: async () => 'org.telegram.messenger' }
    });
    await expect(adapter.probeState({ providerDeviceId: 'dev1', account: {} })).resolves.toBe('online');
  });

  it('bringOnline confirms by fact: login self-report is not trusted when healthCheck says logged_out', async () => {
    const driver = {
      login: async () => ({ ok: true }), // optimistic self-report
      healthCheck: async () => ({ state: 'logged_out' })
    };
    const { adapter } = build({ driver, capabilities: { stateVocabulary: { logged_in: 'online' } } });
    await expect(adapter.bringOnline({ providerDeviceId: 'dev1', account: {} })).resolves.toEqual({ ok: false });
  });

  it('bringOnline returns ok only when the confirming healthCheck is online', async () => {
    const driver = {
      login: async () => ({ ok: true }),
      healthCheck: async () => ({ state: 'logged_in' })
    };
    const { adapter } = build({
      driver,
      capabilities: { appPackage: 'org.telegram.messenger', stateVocabulary: { logged_in: 'online' } },
      controller: { getCurrentPackage: async () => 'org.telegram.messenger' }
    });
    await expect(adapter.bringOnline({ providerDeviceId: 'dev1', account: {} })).resolves.toEqual({ ok: true });
  });

  it('bringOnline surfaces banned/checkpointed from the confirming healthCheck', async () => {
    const driver = {
      login: async () => ({ ok: true }),
      healthCheck: async () => ({ state: 'banned' })
    };
    const { adapter } = build({ driver, capabilities: { stateVocabulary: {} } });
    await expect(adapter.bringOnline({ providerDeviceId: 'dev1', account: {} })).resolves.toEqual({ ok: false, banned: true });
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
