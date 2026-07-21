import { createDuoplusDeviceRegistrationAdapter } from './duoplus-device-registration-adapter.js';

// DI-fake DuoplusClient recording every call. `overrides` lets each test set the
// shapes returned by listInstalledApps / listTeamApps.
function fakeClient(overrides = {}) {
  const calls = { listInstalledApps: [], listTeamApps: [], installApp: [], initProxy: [], setSmartIp: [] };
  return {
    calls,
    async listInstalledApps(...args) {
      calls.listInstalledApps.push(args);
      return overrides.installed ?? [];
    },
    async listTeamApps(...args) {
      calls.listTeamApps.push(args);
      return overrides.teamApps ?? [];
    },
    async installApp(...args) {
      calls.installApp.push(args);
      return overrides.installResult ?? { ok: true };
    },
    async initProxy(...args) {
      calls.initProxy.push(args);
      return overrides.initProxyResult ?? { ok: true };
    },
    async setSmartIp(...args) {
      calls.setSmartIp.push(args);
      return overrides.setSmartIpResult ?? { ok: true };
    }
  };
}

const device = { providerDeviceId: 'dev1' };

describe('duoplusDeviceRegistrationAdapter', () => {
  it('skips install when WhatsApp already installed, and skips proxy when unconfigured', async () => {
    const client = fakeClient({ installed: [{ packageName: 'com.whatsapp' }] });
    const adapter = createDuoplusDeviceRegistrationAdapter({ client });

    await adapter.ensureReady(device);

    expect(client.calls.listInstalledApps).toEqual([['dev1']]);
    expect(client.calls.installApp).toHaveLength(0);
    expect(client.calls.setSmartIp).toHaveLength(0);
    expect(client.calls.initProxy).toHaveLength(0);
  });

  it('installs using an explicit config.whatsappTeamAppId when not installed', async () => {
    const client = fakeClient({ installed: [] });
    const adapter = createDuoplusDeviceRegistrationAdapter({
      client,
      config: { whatsappTeamAppId: 'wa123' }
    });

    await adapter.ensureReady(device);

    expect(client.calls.listTeamApps).toHaveLength(0);
    expect(client.calls.installApp).toEqual([[['dev1'], 'wa123']]);
  });

  it('resolves the team-APK id from the team catalog when no config id', async () => {
    const client = fakeClient({
      installed: [],
      teamApps: [{ packageName: 'com.whatsapp', appId: 'team-wa' }]
    });
    const adapter = createDuoplusDeviceRegistrationAdapter({ client });

    await adapter.ensureReady(device);

    expect(client.calls.listTeamApps).toHaveLength(1);
    expect(client.calls.installApp).toEqual([[['dev1'], 'team-wa']]);
  });

  it('throws WHATSAPP_TEAM_APP_NOT_FOUND when no id is found anywhere', async () => {
    const client = fakeClient({ installed: [], teamApps: [] });
    const adapter = createDuoplusDeviceRegistrationAdapter({ client });

    await expect(adapter.ensureReady(device)).rejects.toThrow('WHATSAPP_TEAM_APP_NOT_FOUND');
    expect(client.calls.installApp).toHaveLength(0);
  });

  it('provisions the proxy via setSmartIp (never initProxy) when config.proxy is set', async () => {
    const client = fakeClient({ installed: [{ packageName: 'com.whatsapp' }] });
    const proxy = { host: 'h', port: 8080, user: 'u', password: 'p' };
    const adapter = createDuoplusDeviceRegistrationAdapter({ client, config: { proxy } });

    await adapter.ensureReady(device);

    expect(client.calls.setSmartIp).toEqual([['dev1', proxy]]);
    expect(client.calls.initProxy).toHaveLength(0);
  });

  it('skips proxy provisioning entirely (no setSmartIp, no initProxy) when config.proxy is absent', async () => {
    const client = fakeClient({ installed: [], teamApps: [{ packageName: 'com.whatsapp', appId: 'team-wa' }] });
    const adapter = createDuoplusDeviceRegistrationAdapter({ client });

    await adapter.ensureReady(device);

    // install still happens as before
    expect(client.calls.installApp).toEqual([[['dev1'], 'team-wa']]);
    // but no proxy call of any kind
    expect(client.calls.setSmartIp).toHaveLength(0);
    expect(client.calls.initProxy).toHaveLength(0);
  });
});
