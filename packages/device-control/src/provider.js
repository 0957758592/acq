import { VmosClient } from './vmos-client.js';
import { VmosDirectController } from './vmos-direct-controller.js';
import { DuoplusClient, listFromDuoPlusResponse, resolveDuoPlusAppIds } from './duoplus-client.js';
import { DuoplusDirectController } from './duoplus-direct-controller.js';
import { GeeLarkClient } from './geelark-client.js';
import { AdbClient } from './adb-client.js';
import { DeviceControlError } from './errors.js';

// DuoPlus power ops return per-device { success:[ids], fail:[ids], fail_reason:{id} }.
// A device in `fail` did NOT change state (e.g. an expired lease) — surface it as a
// coded seam with the vendor reason, never a false success (verify-by-fact).
function assertDuoPlusPower(result, providerDeviceId, code, verb) {
  const data = result?.data || result || {};
  const failed = Array.isArray(data.fail) ? data.fail.map(String) : [];
  if (failed.includes(String(providerDeviceId))) {
    const reason = data.fail_reason?.[providerDeviceId] || `failed to ${verb}`;
    throw new DeviceControlError(`device ${providerDeviceId} failed to ${verb}: ${reason}`, { code, details: data });
  }
}

function listFromInstanceResponse(result = {}) {
  const data = result.data || result;
  if (Array.isArray(data)) return data;
  return data.list || data.records || data.rows || data.items || [];
}

function asAppIdArray(value) {
  return (Array.isArray(value) ? value : [value])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function installedPackageSet(response = {}) {
  return new Set(
    listFromDuoPlusResponse(response)
      .map((app) => String(app.packageName || app.package || app.package_name || app.pkg || app.bundle_id || '').trim())
      .filter(Boolean)
  );
}

export class VmosCloudPhoneProvider {
  constructor({ client }) {
    if (!client) throw new DeviceControlError('VMOS client is required', { code: 'PROVIDER_CONFIG' });
    this.type = 'vmos';
    this.client = client;
    // VMOS ships files via pushFileByUrl and runs server-side RPA (createTKTask);
    // native app provisioning (installApp/APK push) is not yet wired — the
    // registration path uses pushFileByUrl until a verified VMOS install call lands.
    this.capabilities = Object.freeze({ provisionApps: false, pushFileByUrl: true, tikTokTask: true });
  }

  listDevices() {
    return this.client.listDevices();
  }

  async describeInstance(providerDeviceId) {
    const result = await this.client.listInstances({ padCodes: [providerDeviceId] });
    const instances = listFromInstanceResponse(result);
    return (
      instances.find(
        (instance) =>
          String(instance.padCode || instance.pad_code || instance.providerDeviceId || instance.deviceCode || '') ===
          String(providerDeviceId)
      ) || null
    );
  }

  async startDevice(providerDeviceId) {
    const result = await this.client.startDevice(providerDeviceId);
    return { success: true, result };
  }

  async stopDevice(providerDeviceId) {
    const result = await this.client.stopDevice(providerDeviceId);
    return { success: true, result };
  }

  getAdbConnection(providerDeviceId) {
    return this.client.getAdbConnection(providerDeviceId);
  }

  pushFileByUrl(providerDeviceId, payload) {
    return this.client.pushFileByUrl(providerDeviceId, payload);
  }

  createTikTokPostTask(providerDeviceId, payload) {
    return this.client.createTikTokPostTask(providerDeviceId, payload);
  }

  createDirectController(providerDeviceId, options = {}) {
    return new VmosDirectController({
      client: this.client,
      padCode: providerDeviceId,
      ...options
    });
  }

  screenshot(providerDeviceId, options) {
    return this.client.getPreviewImage([providerDeviceId], options);
  }

  setSmartIp(providerDeviceId, proxy) {
    return this.client.setSmartIp([providerDeviceId], proxy);
  }
}

export class DuoplusCloudPhoneProvider {
  constructor({ client }) {
    if (!client) throw new DeviceControlError('DuoPlus client is required', { code: 'PROVIDER_CONFIG' });
    this.type = 'duoplus';
    this.client = client;
    // DuoPlus provisions from its hosted catalog (/app/install); it does not
    // expose pushFileByUrl or direct task automation (those throw).
    this.capabilities = Object.freeze({ provisionApps: true, pushFileByUrl: false, tikTokTask: false });
  }

  listDevices(options) {
    return this.client.listCloudPhones(options);
  }

  async describeInstance(providerDeviceId) {
    const result = await this.client.listCloudPhones({ image_id: [providerDeviceId], page: 1, pagesize: 1 });
    return (
      listFromDuoPlusResponse(result).find((phone) => String(phone.id || phone.image_id || '') === String(providerDeviceId)) ||
      null
    );
  }

  // Current egress proxy of the cloud phone (null if none). Used to ENFORCE that an
  // account only ever logs in behind a proxy (proxyMode:'required'). DuoPlus sets the
  // proxy at device init; this reads it back.
  async getDeviceProxy(providerDeviceId) {
    const res = await this.client.getPhoneInfo(providerDeviceId);
    const proxy = res?.data?.proxy ?? null;
    if (!proxy || !(proxy.id || proxy.ip)) return null;
    return { id: proxy.id ?? null, ip: proxy.ip ?? null, country: proxy.country ?? null, region: proxy.region ?? null };
  }

  async startDevice(providerDeviceId) {
    const result = await this.client.powerOn([providerDeviceId]);
    assertDuoPlusPower(result, providerDeviceId, 'DEVICE_POWER_ON_FAILED', 'power on');
    return { success: true, result };
  }

  async stopDevice(providerDeviceId) {
    const result = await this.client.powerOff([providerDeviceId]);
    assertDuoPlusPower(result, providerDeviceId, 'DEVICE_POWER_OFF_FAILED', 'power off');
    return { success: true, result };
  }

  getAdbConnection(providerDeviceId) {
    return this.client.getAdbConnection(providerDeviceId);
  }

  listApps(options) {
    return this.client.listPlatformApps(options);
  }

  installApps(providerDeviceId, appIds = []) {
    return Promise.all(
      asAppIdArray(appIds).map((appId) => this.client.installApp([providerDeviceId], appId))
    );
  }

  // Ship a phone with a named app set using the DuoPlus-hosted catalog
  // (/app/platformList -> /app/install). No APK hosting or ADB push required.
  async provisionApps(providerDeviceId, { appNames = [], appIds = [] } = {}) {
    const targetIds = [...asAppIdArray(appIds)];
    let missing = [];
    let matched = [];
    if (appNames.length) {
      const catalog = listFromDuoPlusResponse(await this.client.listPlatformApps({ pagesize: 100 }));
      const { matched: matchedApps, missing: notFound } = resolveDuoPlusAppIds(catalog, appNames);
      matched = matchedApps;
      missing = notFound;
      for (const app of matched) if (!targetIds.includes(app.appId)) targetIds.push(app.appId);
    }
    const installedPackages = installedPackageSet(await this.client.listInstalledApps(providerDeviceId).catch(() => ({})));
    const matchedById = new Map(matched.map((app) => [app.appId, app]));
    const installed = [];
    for (const appId of targetIds) {
      const app = matchedById.get(appId);
      if (app?.packageName && installedPackages.has(app.packageName)) {
        installed.push({ appId, packageName: app.packageName, ok: true, skipped: true });
        continue;
      }
      // sequential to respect the 1 QPS-per-endpoint limit
      const result = await this.client.installApp([providerDeviceId], appId);
      installed.push({ appId, packageName: app?.packageName || '', ok: result?.code === 200 || result?.code === undefined });
    }
    return { installed, missing };
  }

  listInstalledApps(providerDeviceId) {
    return this.client.listInstalledApps(providerDeviceId);
  }

  pushFileByUrl() {
    throw new DeviceControlError('DuoPlus uses /app/install for app provisioning; pushFileByUrl is not used', {
      code: 'DUOPLUS_UPLOAD_UNAVAILABLE'
    });
  }

  createTikTokPostTask() {
    throw new DeviceControlError('DuoPlus task automation runs via RPA templates, not direct tasks', {
      code: 'DUOPLUS_TASK_UNAVAILABLE'
    });
  }

  createDirectController(providerDeviceId, options = {}) {
    return new DuoplusDirectController({
      client: this.client,
      imageId: providerDeviceId,
      ...options
    });
  }

  screenshot(providerDeviceId) {
    return this.createDirectController(providerDeviceId).screenshot();
  }

  setSmartIp(providerDeviceId, proxy) {
    return this.client.setSmartIp(providerDeviceId, proxy);
  }
}

export class GeeLarkCloudPhoneProvider {
  constructor({ client }) {
    if (!client) throw new DeviceControlError('GeeLark client is required', { code: 'PROVIDER_CONFIG' });
    this.type = 'geelark';
    this.client = client;
    // GeeLark installs from its app catalog (AppVersionId) and is driven over
    // network ADB. Catalog-name provisioning and proxy config are not yet wired
    // (verify-by-fact response shapes), so those capabilities read false here.
    this.capabilities = Object.freeze({ provisionApps: false, pushFileByUrl: false, tikTokTask: false });
  }

  listDevices(options) {
    return this.client.listDevices(options);
  }

  describeInstance(providerDeviceId) {
    return this.client.describeInstance(providerDeviceId);
  }

  async startDevice(providerDeviceId) {
    const result = await this.client.startDevice(providerDeviceId);
    return { success: true, result };
  }

  async stopDevice(providerDeviceId) {
    const result = await this.client.stopDevice(providerDeviceId);
    return { success: true, result };
  }

  getAdbConnection(providerDeviceId) {
    return this.client.getAdbConnection(providerDeviceId);
  }

  installApp(providerDeviceId, appVersionId) {
    return this.client.installApp(providerDeviceId, appVersionId);
  }

  // GeeLark is controlled via network ADB; the composition resolves the adb
  // serial from getAdbConnection and passes it here.
  createDirectController(providerDeviceId, { serial = '', adbPath } = {}) {
    return new AdbClient({ serial, ...(adbPath ? { adbPath } : {}) });
  }

  screenshot(providerDeviceId) {
    return this.client.screenshot(providerDeviceId);
  }

  // Proxy/SmartIP wiring for GeeLark is not confirmed against the live API —
  // fail-safe verify-by-fact seam (never a silent guess).
  setSmartIp() {
    throw new DeviceControlError('GeeLark proxy/SmartIP wiring is unverified', {
      code: 'GEELARK_SETSMARTIP_UNVERIFIED'
    });
  }
}

// Generalized DeviceProvider factory (TZ §5.1). Selects an adapter by `type`
// and normalizes construction; new providers (+geelark, +matt-duo, emulators)
// register here without touching callers (Open/Closed).
export function createDeviceProvider({ type = 'vmos', ...config } = {}) {
  if (type === 'vmos') {
    return new VmosCloudPhoneProvider({
      client: new VmosClient(config)
    });
  }

  if (type === 'duoplus') {
    return new DuoplusCloudPhoneProvider({
      client: new DuoplusClient(config)
    });
  }

  if (type === 'geelark') {
    return new GeeLarkCloudPhoneProvider({
      client: new GeeLarkClient(config)
    });
  }

  if (type === 'matt-duo') {
    // Known provider, unverified auth (TZ §5.8). Fail-safe: block construction
    // with a coded seam until a real matt-duo cloud-phone auth is confirmed by
    // fact — never guess endpoints/credentials in production.
    throw new DeviceControlError('matt-duo cloud-phone auth is unverified', {
      code: 'MATT_DUO_AUTH_UNVERIFIED'
    });
  }

  throw new DeviceControlError(`Unsupported device provider: ${type}`, {
    code: 'UNSUPPORTED_PROVIDER'
  });
}

// Backward-compatible alias — existing callers use createCloudPhoneProvider.
export const createCloudPhoneProvider = createDeviceProvider;
