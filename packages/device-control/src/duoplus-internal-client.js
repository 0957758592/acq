import { DeviceControlError } from './errors.js';
import { delay } from './timing.js';

// Client for DuoPlus's INTERNAL web API (api.duoplus.cn), which authenticates with
// the short-lived `Authorization` session token captured from a logged-in browser
// (see apps/api/scripts/capture-session.mjs). This is distinct from DuoplusClient,
// which uses the documented OpenAPI (openapi.duoplus.net) + DuoPlus-API-Key.
//
// Use it for capabilities the OpenAPI does NOT expose — notably batchCapture2,
// which returns base64 JPEG frames for many phones in a single call (cheaper and
// faster than per-phone ADB screencap).

const DEFAULT_BASE_URL = 'https://api.duoplus.cn';
const DEFAULT_MIN_DELAY_MS = 350;

export function normalizeCaptures(response = {}) {
  const captures = response?.data?.captures || [];
  return captures
    .map((c) => {
      const imageId = String(c.image_id || c.imageId || '').trim();
      const b64 = String(c.capture || '').trim();
      if (!imageId) return null;
      return {
        imageId,
        status: Number(c.status),
        linkStatus: Number(c.link_status),
        // DuoPlus returns JPEG bytes; expose a ready-to-render data URL.
        dataUrl: b64 ? `data:image/jpeg;base64,${b64}` : '',
        message: String(c.message || '')
      };
    })
    .filter(Boolean);
}

export function listFromDuoPlusInternal(response = {}) {
  const data = response?.data || response;
  if (Array.isArray(data)) return data;
  return data.list || data.records || data.rows || data.items || [];
}

export class DuoplusInternalClient {
  constructor({
    token,
    baseUrl = DEFAULT_BASE_URL,
    minDelayMs = DEFAULT_MIN_DELAY_MS,
    fetchImpl = globalThis.fetch,
    sleep = delay
  } = {}) {
    if (!token) throw new DeviceControlError('Missing DuoPlus session token', { code: 'DUOPLUS_SESSION' });
    if (!fetchImpl) throw new DeviceControlError('Missing fetch implementation', { code: 'DUOPLUS_CONFIG' });
    this.token = token;
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

  async request(path, body = {}) {
    await this.waitForEndpoint(path);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: this.token, 'Content-Type': 'application/json', Lang: 'en' },
      body: JSON.stringify(body || {})
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || (typeof data.code === 'number' && data.code !== 200)) {
      throw new DeviceControlError('DuoPlus internal request failed', {
        code: response.status === 401 || data.code === 401 ? 'DUOPLUS_SESSION_EXPIRED' : 'DUOPLUS_INTERNAL_FAILED',
        details: { status: response.status, path, code: data.code, message: data.message }
      });
    }
    return data;
  }

  controlList(options = {}) {
    return this.request('/image/controlList', {
      page: 1,
      pagesize: 20,
      region_type_id: options.regionTypeId || '',
      group_id: options.groupId || 'all',
      keyword: options.keyword || ''
    });
  }

  listImages(options = {}) {
    return this.request('/image/list', {
      page: Number(options.page || 1),
      pagesize: Number(options.pagesize || 20),
      group_id: options.groupId || 'all',
      fid: options.fid || '-1',
      link_status: options.linkStatus || ['0', '1', '2', '4']
    });
  }

  // Returns base64 JPEG frames for the given phones in a single call.
  batchCapture(imageIds = [], { width = 320, height = 320, quality = 20, supplierId = 1 } = {}) {
    return this.request('/image/batchCapture2', {
      image_ids: imageIds,
      width,
      height,
      quality,
      supplier_id: supplierId
    });
  }

  batchHeartbeat(imageIds = [], type = 1) {
    return this.request('/image/batchHeartbeat', { image_ids: imageIds, type });
  }

  // Returns the ARMVM/veRTC control token for live control (out of demo scope).
  connect(imageId) {
    return this.request('/image/connect', { image_id: String(imageId || '') });
  }

  async captureFrames(imageIds = [], options = {}) {
    return normalizeCaptures(await this.batchCapture(imageIds, options));
  }
}
