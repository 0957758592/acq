import crypto from 'node:crypto';

import { DeviceControlError } from './errors.js';

const DEFAULT_BASE_URL = 'https://api.vmoscloud.com';
const DEFAULT_HOST = 'api.vmoscloud.com';
const SUCCESS_CODES = new Set([0, 200]);

function getXDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z'
  ].join('');
}

function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(path, String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''));
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

export class VmosClient {
  constructor({
    accessKey,
    secretKey,
    baseUrl = DEFAULT_BASE_URL,
    host = DEFAULT_HOST,
    fetchImpl = globalThis.fetch
  } = {}) {
    if (!accessKey) throw new DeviceControlError('Missing VMOS access key', { code: 'VMOS_CONFIG' });
    if (!secretKey) throw new DeviceControlError('Missing VMOS secret key', { code: 'VMOS_CONFIG' });
    if (!fetchImpl) throw new DeviceControlError('Missing fetch implementation', { code: 'VMOS_CONFIG' });

    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.baseUrl = baseUrl;
    this.host = host;
    this.fetchImpl = fetchImpl;
  }

  createAuthorization({ bodyString, xDate }) {
    const contentHash = sha256Hex(bodyString);
    const signedHeaders = 'content-type;host;x-content-sha256;x-date';
    const canonical = [
      `host:${this.host}`,
      `x-date:${xDate}`,
      'content-type:application/json;charset=UTF-8',
      `signedHeaders:${signedHeaders}`,
      `x-content-sha256:${contentHash}`
    ].join('\n');
    const shortDate = xDate.slice(0, 8);
    const credentialScope = `${shortDate}/armcloud-paas/request`;
    const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256Hex(canonical)].join('\n');
    const dateKey = hmac(this.secretKey, shortDate);
    const serviceKey = hmac(dateKey, 'armcloud-paas');
    const signingKey = hmac(serviceKey, 'request');
    const signature = hmac(signingKey, stringToSign, 'hex');

    return {
      authorization: `HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      contentHash
    };
  }

  async request(path, { method = 'POST', body = {}, query = {}, headers = {} } = {}) {
    const isGet = method.toUpperCase() === 'GET';
    const bodyString = isGet ? '' : JSON.stringify(body || {});
    const xDate = getXDate();
    const { authorization, contentHash } = this.createAuthorization({ bodyString, xDate });
    const response = await this.fetchImpl(buildUrl(this.baseUrl, path, query), {
      method,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'x-date': xDate,
        'x-host': this.host,
        'x-content-sha256': contentHash,
        authorization,
        ...headers
      },
      body: isGet ? undefined : bodyString
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || (typeof data.code === 'number' && !SUCCESS_CODES.has(data.code))) {
      throw new DeviceControlError('VMOS request failed', {
        code: 'VMOS_REQUEST_FAILED',
        details: { status: response.status, path, data }
      });
    }
    return data;
  }

  listInstances({ rows = 50, padStatus = 10, padCodes, online, lastId } = {}) {
    const body = { rows, padStatus };
    if (lastId != null) body.lastId = lastId;
    if (Array.isArray(padCodes) && padCodes.length) body.padCodes = padCodes;
    if (online !== undefined) body.online = online;
    return this.request('/vcpcloud/api/padApi/userPadList', { body });
  }

  listDevices(options) {
    return this.listInstances(options);
  }

  startDevice(providerDeviceId) {
    return this.startApp([providerDeviceId], 'com.android.settings');
  }

  stopDevice(providerDeviceId) {
    return this.request('/vcpcloud/api/padApi/dissolveRoom', { body: { padCodes: [providerDeviceId] } });
  }

  enableAdb(padCodes) {
    return this.request('/vcpcloud/api/padApi/openOnlineAdb', { body: { padCodes, openStatus: 1 } });
  }

  disableAdb(padCodes) {
    return this.request('/vcpcloud/api/padApi/openOnlineAdb', { body: { padCodes, openStatus: 0 } });
  }

  getAdbConnection(providerDeviceId) {
    return this.request('/vcpcloud/api/padApi/adb', { body: { padCode: providerDeviceId, enable: true } });
  }

  pushFileByUrl(padCodes, urlOrPayload, options = {}) {
    const resolvedPadCodes = Array.isArray(padCodes) ? padCodes : [padCodes];
    const payload =
      typeof urlOrPayload === 'string'
        ? { url: urlOrPayload, ...options }
        : { ...(urlOrPayload || {}) };
    return this.request('/vcpcloud/api/padApi/uploadFileV3', {
      body: {
        padCodes: resolvedPadCodes,
        url: payload.url,
        md5: payload.md5 || '',
        customizeFilePath: payload.customizeFilePath || payload.remotePath || '/DCIM/',
        autoInstall: payload.autoInstall ?? 0
      }
    });
  }

  getFileTaskStatus(taskIds) {
    return this.request('/vcpcloud/api/padApi/fileTaskDetail', { body: { taskIds } });
  }

  createTKTask(taskName, taskType, list, remarks = '') {
    return this.request('/vcpcloud/api/padApi/addAutoTask', {
      body: { taskName, taskType, list, remarks }
    });
  }

  listTKTasks({ page = 1, rows = 20, taskType } = {}) {
    const body = { page, rows };
    if (taskType !== undefined) body.taskType = taskType;
    return this.request('/vcpcloud/api/padApi/autoTaskList', { body });
  }

  cancelTKTask(taskIds) {
    return this.request('/vcpcloud/api/padApi/cancelAutoTask', { body: { taskIds } });
  }

  retryTKTask(taskIds, plannedExecutionTime = '') {
    return this.request('/vcpcloud/api/padApi/reExecutionAutoTask', {
      body: { taskIds, plannedExecutionTime }
    });
  }

  createTikTokPostTask(providerDeviceId, payload) {
    return this.createTKTask(payload?.taskName || `julio-tiktok-post-${Date.now()}`, 5, [
      { padCode: providerDeviceId, ...payload }
    ]);
  }

  startApp(padCodes, pkgName) {
    return this.request('/vcpcloud/api/padApi/startApp', { body: { padCodes, pkgName } });
  }

  stopApp(padCodes, pkgName) {
    return this.request('/vcpcloud/api/padApi/stopApp', { body: { padCodes, pkgName } });
  }

  execAdbCommand(padCodes, scriptContent) {
    return this.request('/vcpcloud/api/padApi/asyncCmd', { body: { padCodes, scriptContent } });
  }

  async getScriptResult(taskIds) {
    const response = await this.request('/vcpcloud/api/padApi/padTaskDetail', { body: { taskIds } });
    if (Array.isArray(response.data)) {
      response.data = response.data.map((entry) => ({
        ...entry,
        taskResult: entry.taskResult ?? entry.result ?? ''
      }));
    }
    return response;
  }

  getTaskResult(taskIds) {
    return this.getScriptResult(taskIds);
  }

  inputText(padCodes, text) {
    return this.request('/vcpcloud/api/padApi/inputText', { body: { padCodes, text } });
  }

  setSmartIp(padCodes, proxy = {}) {
    return this.request('/vcpcloud/api/padApi/smartIp', {
      body: {
        padCodes,
        host: proxy.host,
        port: Number(proxy.port),
        account: proxy.account || proxy.username || '',
        password: proxy.password || '',
        type: proxy.type || 'socks5',
        mode: proxy.mode || 'vpn'
      }
    });
  }

  getPreviewImage(padCodes, options = {}) {
    return this.request('/vcpcloud/api/padApi/getLongGenerateUrl', {
      body: {
        padCodes,
        quality: options.quality || 60,
        width: options.width || 720,
        height: options.height || 1280
      }
    });
  }

  screenshot(padCodes, options = {}) {
    return this.getPreviewImage(padCodes, options);
  }

  queryCurrentTrafficBalance() {
    return this.request('/vcpcloud/api/padApi/queryCurrentTrafficBalance', { body: {} });
  }

  getDynamicGoodService() {
    return this.request('/vcpcloud/api/padApi/getDynamicGoodService', { body: {} });
  }

  getDynamicProxyRegion() {
    return this.request('/vcpcloud/api/padApi/getDynamicProxyRegion', { body: {} });
  }

  buyDynamicGB({ goodId, quantity = 1, autoRenew = true, idempotencyKey = '' } = {}) {
    if (!goodId) throw new DeviceControlError('VMOS dynamic good id is required', { code: 'VMOS_CONFIG' });
    return this.request('/vcpcloud/api/padApi/buyDynamicGoodService', {
      body: {
        goodId,
        num: Number(quantity || 1),
        autoRenew: autoRenew ? 1 : 0,
        outTradeNo: idempotencyKey || undefined
      }
    });
  }
}
