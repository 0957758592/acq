import { DeviceControlError } from './errors.js';
import { delay } from './timing.js';

const DEFAULT_BASE_URL = 'https://openapi.duoplus.net';
const DEFAULT_MIN_DELAY_MS = 1100;
const REDACTED = '[REDACTED]';

const STATUS_TO_ENGINE = new Map([
  [0, 'provisioning'],
  [1, 'running'],
  [2, 'stopped'],
  [3, 'retired'],
  [4, 'unhealthy'],
  [10, 'starting'],
  [11, 'provisioning'],
  [12, 'unhealthy']
]);

const SENSITIVE_KEY_NAMES = new Set([
  'authorization',
  'cookie',
  'token',
  'secret',
  'password',
  'passwd',
  'session',
  'signature',
  'signed_url',
  'api_key',
  'apikey',
  'duoplus_api_key',
  'adb_password',
  'auth',
  'sign'
]);
const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'authorization',
  'cookie',
  'duoplus_api_key',
  'key',
  'session',
  'session_id',
  'sign',
  'signature',
  'token',
  'x-amz-credential',
  'x-amz-security-token',
  'x-amz-signature'
]);

function asArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== undefined && entry !== null);
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function buildUrl(baseUrl, path) {
  return new URL(path, String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''));
}

function isSensitiveKey(key = '') {
  const normalized = String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (SENSITIVE_KEY_NAMES.has(normalized)) return true;
  return /(token|secret|password|signature|session)$/.test(normalized);
}

function redactUrl(value) {
  try {
    const url = new URL(String(value));
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) || isSensitiveKey(key)) {
        url.searchParams.set(key, REDACTED);
      }
    }
    return url.toString().replace(/%5BREDACTED%5D/g, REDACTED);
  } catch {
    return String(value || '');
  }
}

function redactValue(key, value) {
  if (isSensitiveKey(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((entry) => redactValue('', entry));
  if (value && typeof value === 'object') return redactObject(value);
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return redactUrl(value);
  return value;
}

function redactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, entry]) => [key, redactValue(key, entry)])
  );
}

function responseDataList(response = {}) {
  const data = response.data || response;
  if (Array.isArray(data)) return data;
  return data.list || data.records || data.rows || data.items || [];
}

function firstGroupName(group) {
  if (!Array.isArray(group)) return '';
  return group.map((entry) => entry?.name).filter(Boolean).join(', ');
}

function proxyConfigured(phone = {}) {
  const proxy = phone.proxy || {};
  return Boolean(phone.proxy_id || proxy.id || proxy.ip || phone.ip);
}

export function redactDuoPlusCapture(capture = {}) {
  return redactObject(capture);
}

export function duoPlusStatusToEngineStatus(status) {
  const numeric = Number(status);
  return STATUS_TO_ENGINE.get(numeric) || 'unhealthy';
}

export function normalizeDuoPlusApp(app = {}) {
  const appId = String(app.app_id || app.id || '').trim();
  if (!appId) return null;
  return {
    appId,
    name: String(app.name || app.app_name || app.title || '').trim(),
    packageName: String(app.package || app.package_name || app.pkg || app.bundle_id || '').trim(),
    versionId: String(app.app_version_id || app.version_id || '').trim(),
    raw: app
  };
}

// Resolve human app names/packages to DuoPlus app_ids from a catalog list.
export function resolveDuoPlusAppIds(catalog = [], wanted = []) {
  const apps = catalog.map(normalizeDuoPlusApp).filter(Boolean);
  const want = wanted.map((w) => String(w || '').trim().toLowerCase()).filter(Boolean);
  const matched = [];
  const missing = [];
  for (const term of want) {
    const hit = apps.find(
      (app) =>
        app.packageName.toLowerCase() === term ||
        app.name.toLowerCase() === term ||
        app.name.toLowerCase().includes(term)
    );
    if (hit) matched.push(hit);
    else missing.push(term);
  }
  return { matched, missing };
}

export function normalizeDuoPlusPhone(phone = {}) {
  const providerDeviceId = String(phone.id || phone.image_id || phone.imageId || '').trim();
  if (!providerDeviceId) return null;
  const proxy = phone.proxy || {};
  return {
    provider: 'duoplus',
    providerDeviceId,
    name: String(phone.name || providerDeviceId).trim(),
    status: duoPlusStatusToEngineStatus(phone.status ?? phone.link_status),
    region: String(phone.area || proxy.country || '').trim().toUpperCase(),
    groupName: firstGroupName(phone.group),
    notes: String(phone.remark || '').trim(),
    runtime: {
      adbAddress: String(phone.adb || '').trim(),
      adbPassword: '',
      lastHeartbeatAt: new Date()
    },
    providerMeta: {
      rawStatus: Number(phone.status ?? phone.link_status),
      os: String(phone.os || '').trim(),
      ip: String(phone.ip || '').trim(),
      proxyId: String(phone.proxy_id || proxy.id || '').trim(),
      proxyIp: String(proxy.ip || '').trim(),
      proxyConfigured: proxyConfigured(phone),
      expiredAt: String(phone.expired_at || '').trim()
    }
  };
}

export class DuoplusClient {
  constructor({
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    minDelayMs = DEFAULT_MIN_DELAY_MS,
    fetchImpl = globalThis.fetch,
    sleep = delay
  } = {}) {
    if (!apiKey) throw new DeviceControlError('Missing DuoPlus API key', { code: 'DUOPLUS_CONFIG' });
    if (!fetchImpl) throw new DeviceControlError('Missing fetch implementation', { code: 'DUOPLUS_CONFIG' });
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.minDelayMs = Number(minDelayMs ?? DEFAULT_MIN_DELAY_MS);
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.lastRequestAt = new Map();
  }

  async waitForEndpoint(path) {
    const floor = Math.max(0, this.minDelayMs);
    if (!floor) return;
    const last = this.lastRequestAt.get(path) || 0;
    const waitMs = floor - (Date.now() - last);
    if (waitMs > 0) await this.sleep(waitMs);
    this.lastRequestAt.set(path, Date.now());
  }

  async request(path, { method = 'POST', body = {}, headers = {} } = {}) {
    await this.waitForEndpoint(path);
    const isGet = method.toUpperCase() === 'GET';
    const response = await this.fetchImpl(buildUrl(this.baseUrl, path), {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'DuoPlus-API-Key': this.apiKey,
        ...headers
      },
      body: isGet ? undefined : JSON.stringify(body || {})
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || (typeof data.code === 'number' && data.code !== 200)) {
      throw new DeviceControlError('DuoPlus request failed', {
        code: 'DUOPLUS_REQUEST_FAILED',
        details: redactDuoPlusCapture({ status: response.status, path, data })
      });
    }
    return data;
  }

  listCloudPhones(options = {}) {
    return this.request('/api/v1/cloudPhone/list', {
      body: {
        page: Number(options.page || 1),
        pagesize: Number(options.pagesize || options.pageSize || 100),
        ...options
      }
    });
  }

  listDevices(options) {
    return this.listCloudPhones(options);
  }

  getPhoneStatus(imageIds) {
    return this.request('/api/v1/cloudPhone/status', { body: { image_ids: asArray(imageIds) } });
  }

  getPhoneInfo(imageId) {
    return this.request('/api/v1/cloudPhone/info', { body: { image_id: String(imageId || '') } });
  }

  powerOn(imageIds) {
    return this.request('/api/v1/cloudPhone/powerOn', { body: { image_ids: asArray(imageIds) } });
  }

  powerOff(imageIds) {
    return this.request('/api/v1/cloudPhone/powerOff', { body: { image_ids: asArray(imageIds) } });
  }

  restart(imageIds) {
    return this.request('/api/v1/cloudPhone/restart', { body: { image_ids: asArray(imageIds) } });
  }

  initProxy(images = []) {
    return this.request('/api/v1/cloudPhone/initProxy', { body: { images } });
  }

  executeCommand(imageId, command) {
    return this.request('/api/v1/cloudPhone/command', {
      body: { image_id: String(imageId || ''), command: String(command || '') }
    });
  }

  executeCommandBatch(imageIds, command) {
    return this.request('/api/v1/cloudPhone/command', {
      body: { image_ids: asArray(imageIds), command: String(command || '') }
    });
  }

  execAdbCommand(imageIds, command) {
    const ids = asArray(imageIds);
    if (ids.length === 1) return this.executeCommand(ids[0], command);
    return this.executeCommandBatch(ids, command);
  }

  startDevice(providerDeviceId) {
    return this.powerOn([providerDeviceId]);
  }

  stopDevice(providerDeviceId) {
    return this.powerOff([providerDeviceId]);
  }

  async getAdbConnection(providerDeviceId) {
    const response = await this.listCloudPhones({ image_id: [providerDeviceId], page: 1, pagesize: 1 });
    const phone = responseDataList(response)[0] || {};
    return { code: 200, data: { adb: phone.adb || '', key: '', adb_password: '' } };
  }

  async getPreviewImage() {
    return { code: 200, data: { url: '' } };
  }

  async setSmartIp(providerDeviceId, proxy = {}) {
    return this.initProxy([
      {
        image_id: providerDeviceId,
        ip_scan_channel: proxy.ipScanChannel || 'ipapi',
        proxy: proxy.id
          ? { id: proxy.id }
          : {
              host: proxy.host,
              port: Number(proxy.port),
              user: proxy.user || proxy.username || '',
              password: proxy.password || ''
            }
      }
    ]);
  }

  // ---- Application management (DuoPlus-hosted app catalog) ----

  // Verified live endpoint is /api/v1/app/list (the docs' "platformList" is wrong).
  listPlatformApps(options = {}) {
    return this.request('/api/v1/app/list', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || options.pageSize || 100), ...options }
    });
  }

  listTeamApps(options = {}) {
    return this.request('/api/v1/app/teamList', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || options.pageSize || 100), ...options }
    });
  }

  installApp(imageIds, appId, appVersionId = '') {
    return this.request('/api/v1/app/install', {
      body: { image_ids: asArray(imageIds), app_id: String(appId || ''), app_version_id: String(appVersionId || '') }
    });
  }

  listInstalledApps(imageId) {
    return this.request('/api/v1/app/installedList', { body: { image_id: String(imageId || '') } });
  }

  uninstallApp(imageIds, packageName) {
    return this.request('/api/v1/app/uninstall', {
      body: { image_ids: asArray(imageIds), package_name: String(packageName || '') }
    });
  }

  // ---- Proxy management ----

  listProxies(options = {}) {
    return this.request('/api/v1/proxy/list', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || options.pageSize || 100), ...options }
    });
  }

  addProxies(proxyList = [], ipScanChannel = 'ip2location') {
    return this.request('/api/v1/proxy/add', {
      body: { proxy_list: asArray(proxyList), ip_scan_channel: ipScanChannel }
    });
  }


  // ---- Device lifecycle: purchase & renewal ----

  purchaseCloudPhones({ os, duration = '30', quantity = 1, couponCode = '', renewalStatus = 1 } = {}) {
    return this.request('/api/v1/cloudPhone/purchase', {
      body: {
        os: String(os || ''),
        duration: String(duration),
        quantity: Number(quantity) || 1,
        coupon_code: String(couponCode || ''),
        renewal_status: Number(renewalStatus)
      }
    });
  }

  renewCloudPhones(imageIds, { duration = '30', couponCode = '' } = {}) {
    return this.request('/api/v1/cloudPhone/renewal', {
      body: {
        image_ids: asArray(imageIds),
        duration: String(duration),
        coupon_code: String(couponCode || '')
      }
    });
  }

  // ---- Device management: reset, root, ADB ----

  resetDevice(imageIds) {
    return this.request('/api/v1/cloudPhone/newPhone', {
      body: { image_ids: asArray(imageIds) }
    });
  }

  batchSetRoot(imageIds, status, pkgs = []) {
    return this.request('/api/v1/cloudPhone/batchRoot', {
      body: { image_ids: asArray(imageIds), status: Number(status), pkgs: asArray(pkgs) }
    });
  }

  batchEnableAdb(imageIds) {
    return this.request('/api/v1/cloudPhone/openAdb', {
      body: { image_ids: asArray(imageIds) }
    });
  }

  batchDisableAdb(imageIds) {
    return this.request('/api/v1/cloudPhone/closeAdb', {
      body: { image_ids: asArray(imageIds) }
    });
  }

  // ---- Proxy management (extended) ----

  deleteProxies(proxyIds) {
    return this.request('/api/v1/proxy/delete', {
      body: { proxy_ids: asArray(proxyIds) }
    });
  }

  refreshProxyUrl(proxyIds, url) {
    return this.request('/api/v1/proxy/refresh', {
      body: { proxy_ids: asArray(proxyIds), url: String(url || '') }
    });
  }

  modifyProxy(proxyId, { name, host, port, user, password } = {}) {
    return this.request('/api/v1/proxy/update', {
      body: {
        proxy_id: String(proxyId),
        name: String(name || ''),
        host: String(host || ''),
        port: String(port || ''),
        user: String(user || ''),
        password: String(password || '')
      }
    });
  }

  checkProxy(proxyIds) {
    return this.request('/api/v1/proxy/check', {
      body: { proxy_ids: asArray(proxyIds) }
    });
  }

  // ---- App management (extended) ----

  startApp(imageIds, packageName) {
    return this.request('/api/v1/app/start', {
      body: { image_ids: asArray(imageIds), package_name: String(packageName || '') }
    });
  }

  stopApp(imageIds, packageName) {
    return this.request('/api/v1/app/stop', {
      body: { image_ids: asArray(imageIds), package_name: String(packageName || '') }
    });
  }

  // ---- Groups ----

  listGroups(options = {}) {
    return this.request('/api/v1/cloudPhone/groupList', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || 100) }
    });
  }

  addToGroup(imageIds, groupIds) {
    return this.request('/api/v1/cloudPhone/addToGroup', {
      body: { image_ids: asArray(imageIds), group_ids: asArray(groupIds) }
    });
  }

  moveToGroup(imageIds, groupId) {
    return this.request('/api/v1/cloudPhone/moveToGroup', {
      body: { image_ids: asArray(imageIds), group_id: String(groupId || '') }
    });
  }

  createGroup(name) {
    return this.request('/api/v1/cloudPhone/createGroup', {
      body: { name: String(name || '') }
    });
  }

  updateGroup(groupId, name) {
    return this.request('/api/v1/cloudPhone/updateGroup', {
      body: { group_id: String(groupId), name: String(name || '') }
    });
  }

  deleteGroup(groupIds) {
    return this.request('/api/v1/cloudPhone/deleteGroup', {
      body: { group_ids: asArray(groupIds) }
    });
  }

  // ---- Cloud Drive ----

  listCloudDriveFiles(options = {}) {
    return this.request('/api/v1/cloudDisk/list', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || 100) }
    });
  }

  pushFile(imageIds, fileUrl) {
    return this.request('/api/v1/cloudDisk/pushFiles', {
      body: { image_ids: asArray(imageIds), file_url: String(fileUrl || '') }
    });
  }

  uploadFileSignedUrl(fileName, isApp = false) {
    return this.request('/api/v1/cloudDisk/signedUrl', {
      body: { file_name: String(fileName || ''), is_app: isApp ? 1 : 0 }
    });
  }

  deleteCloudDriveFiles(fileIds) {
    return this.request('/api/v1/cloudDisk/delFiles', {
      body: { file_ids: asArray(fileIds) }
    });
  }

  // ---- Device metadata ----

  listTimezones() {
    return this.request('/api/v1/mobile/timezoneList', { body: {} });
  }

  listLanguages() {
    return this.request('/api/v1/mobile/languageList', { body: {} });
  }

  listPhoneModels() {
    return this.request('/api/v1/mobile/modelList', { body: {} });
  }

  listResolutions() {
    return this.request('/api/v1/cloudPhone/resolutionList', { body: {} });
  }

  listTags() {
    return this.request('/api/v1/cloudPhone/tagList', { body: {} });
  }

  listConnectedMembers() {
    return this.request('/api/v1/cloudPhone/linkUserList', { body: {} });
  }

  // ---- Automation (extended) ----

  listLoopTasks(options = {}) {
    return this.request('/api/v1/automation/planList', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || 100) }
    });
  }

  createLoopTask(task) {
    return this.request('/api/v1/automation/addPlan', { body: task });
  }

  editLoopTask(task) {
    return this.request('/api/v1/automation/savePlan', { body: task });
  }

  setLoopTaskStatus(planIds, status) {
    return this.request('/api/v1/automation/setPlanStatus', {
      body: { plan_ids: asArray(planIds), status: Number(status) }
    });
  }

  deleteLoopTask(planIds) {
    return this.request('/api/v1/automation/deletePlan', {
      body: { plan_ids: asArray(planIds) }
    });
  }

  // ---- Team / Billing ----

  listOrders(options = {}) {
    return this.request('/api/v1/team/order', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || 100) }
    });
  }

  // ---- Cloud Numbers ----

  listCloudNumbers(options = {}) {
    return this.request('/api/v1/cloudNumber/numberList', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || 100) }
    });
  }

  purchaseCloudNumbers({ country, quantity = 1, duration = '30' } = {}) {
    return this.request('/api/v1/cloudNumber/purchase', {
      body: {
        country: String(country || ''),
        quantity: Number(quantity) || 1,
        duration: String(duration)
      }
    });
  }

  renewCloudNumbers(numberIds, { duration = '30' } = {}) {
    return this.request('/api/v1/cloudNumber/renewal', {
      body: { number_ids: asArray(numberIds), duration: String(duration) }
    });
  }

  // ---- Subscription Startup ----

  listSubscriptionStartup(options = {}) {
    return this.request('/api/v1/subscriptionStartup/list', {
      body: { page: Number(options.page || 1), pagesize: Number(options.pagesize || 100) }
    });
  }

  purchaseSubscriptionStartup({ os, duration = '30', quantity = 1 } = {}) {
    return this.request('/api/v1/subscriptionStartup/purchase', {
      body: {
        os: String(os || ''),
        duration: String(duration),
        quantity: Number(quantity) || 1
      }
    });
  }

  renewSubscriptionStartup(imageIds, { duration = '30' } = {}) {
    return this.request('/api/v1/subscriptionStartup/renewal', {
      body: { image_ids: asArray(imageIds), duration: String(duration) }
    });
  }

  // ---- Misc ----

  writeSms(imageId, phoneNumber, message) {
    return this.request('/api/v1/cloudNumber/imageWriteSms', {
      body: {
        image_id: String(imageId || ''),
        phone_number: String(phoneNumber || ''),
        message: String(message || '')
      }
    });
  }

  scanCode(imageId, qrContent) {
    return this.request('/api/v1/cloudPhone/scan', {
      body: { image_id: String(imageId || ''), qr_content: String(qrContent || '') }
    });
  }

  updateSharePassword(imageIds, password) {
    return this.request('/api/v1/cloudPhone/updateSharePassword', {
      body: { image_ids: asArray(imageIds), password: String(password || '') }
    });
  }


  normalizePhone(phone) {
    return normalizeDuoPlusPhone(phone);
  }
}

export function listFromDuoPlusResponse(response = {}) {
  return responseDataList(response);
}
