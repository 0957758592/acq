import crypto from 'node:crypto';

import { DeviceControlError } from './errors.js';

const DEFAULT_BASE_URL = 'https://openapi.geelark.com/open/v1';
const SUCCESS_CODES = new Set([0, 200]);

// SHA256(appId + traceId + ts + nonce + apiKey), upper-hex (GeeLark Open API).
// Pure and deterministic — the signing contract is testable against a fixed vector.
export function geeLarkSign({ appId, traceId, ts, nonce, apiKey }) {
  const stringToSign = `${appId}${traceId}${ts}${nonce}${apiKey}`;
  return crypto.createHash('sha256').update(stringToSign).digest('hex').toUpperCase();
}

function defaultTraceId() {
  return crypto.randomUUID();
}

export class GeeLarkClient {
  constructor({
    appId,
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    genTraceId = defaultTraceId
  } = {}) {
    if (!appId) throw new DeviceControlError('Missing GeeLark appId', { code: 'GEELARK_CONFIG' });
    if (!apiKey) throw new DeviceControlError('Missing GeeLark apiKey', { code: 'GEELARK_CONFIG' });
    if (!fetchImpl) throw new DeviceControlError('Missing fetch implementation', { code: 'GEELARK_CONFIG' });
    this.appId = appId;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.genTraceId = genTraceId;
  }

  buildHeaders() {
    const traceId = String(this.genTraceId());
    const ts = String(this.now());
    const nonce = traceId.substring(0, 6);
    const sign = geeLarkSign({ appId: this.appId, traceId, ts, nonce, apiKey: this.apiKey });
    return {
      'Content-Type': 'application/json',
      appId: this.appId,
      traceId,
      ts,
      nonce,
      sign
    };
  }

  async request(method, path, body = {}) {
    const isGet = String(method).toUpperCase() === 'GET';
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: this.buildHeaders(),
      body: isGet ? undefined : JSON.stringify(body || {})
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || (typeof data.code === 'number' && !SUCCESS_CODES.has(data.code))) {
      throw new DeviceControlError('GeeLark request failed', {
        code: 'GEELARK_REQUEST_FAILED',
        details: { status: response.status, path, code: data.code, msg: data.msg }
      });
    }
    return data;
  }

  // ── Device management (device key = envId/envirId) ──
  listDevices({ page = 1, pageSize = 100 } = {}) {
    return this.request('POST', '/phone/list', { page, pageSize });
  }

  describeInstance(envirId) {
    return this.request('POST', '/envir/detail', { envirId });
  }

  startDevice(envirId) {
    return this.request('POST', '/phone/start', { ids: [envirId] });
  }

  stopDevice(envirId) {
    return this.request('POST', '/envir/stop', { envirId });
  }

  restartDevice(envirId) {
    return this.request('POST', '/envir/restart', { envirId });
  }

  getAdbConnection(envirId) {
    return this.request('POST', '/adb/getData', { ids: [envirId] });
  }

  screenshot(envirId) {
    return this.request('POST', '/envir/screenshot', { envirId });
  }

  installApp(envirId, appVersionId) {
    return this.request('POST', '/app/install', { EnvId: envirId, AppVersionId: appVersionId });
  }
}
