import { VmosClient } from './vmos-client.js';
import { VmosDirectController } from './vmos-direct-controller.js';
import { DuoplusClient, listFromDuoPlusResponse, resolveDuoPlusAppIds } from './duoplus-client.js';
import { DuoplusDirectController } from './duoplus-direct-controller.js';
import { DeviceControlError } from './errors.js';

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

  async startDevice(providerDeviceId) {
    const result = await this.client.powerOn([providerDeviceId]);
    return { success: true, result };
  }

  async stopDevice(providerDeviceId) {
    const result = await this.client.powerOff([providerDeviceId]);
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

export function createCloudPhoneProvider({ type = 'vmos', ...config } = {}) {
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

  throw new DeviceControlError(`Unsupported cloud phone provider: ${type}`, {
    code: 'UNSUPPORTED_PROVIDER'
  });
}
