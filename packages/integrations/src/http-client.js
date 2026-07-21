export class IntegrationHttpClient {
  constructor({ baseUrl = '', headers = {}, fetchImpl = globalThis.fetch } = {}) {
    if (!fetchImpl) throw new Error('fetch implementation is required');
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.headers = headers;
    this.fetchImpl = fetchImpl;
  }

  buildUrl(path) {
    const suffix = String(path || '').replace(/^\/+/, '');
    return this.baseUrl ? `${this.baseUrl}/${suffix}` : `/${suffix}`;
  }

  async request(path, { method = 'GET', body = null, headers = {}, signal = undefined } = {}) {
    const response = await this.fetchImpl(this.buildUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...this.headers,
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined,
      signal
    });
    const text = await response.text();
    const contentType = response.headers?.get?.('content-type') || '';
    const data = parseIntegrationResponse(text, { contentType, status: response.status, url: response.url });
    if (!response.ok) {
      const error = new Error(data?.message || 'Integration request failed');
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return data;
  }
}

function parseIntegrationResponse(text = '', { contentType = '', status = 0, url = '' } = {}) {
  const rawText = String(text || '');
  const trimmed = rawText.trim();
  if (!trimmed) return {};

  const looksLikeJson = contentType.toLowerCase().includes('json') || /^[{[]/.test(trimmed);
  if (!looksLikeJson) {
    const error = new Error('Integration request returned non-JSON response');
    error.status = status;
    error.details = {
      contentType,
      url,
      bodySnippet: trimmed.slice(0, 240)
    };
    throw error;
  }

  try {
    return JSON.parse(trimmed);
  } catch (cause) {
    const error = new Error('Integration request returned invalid JSON');
    error.status = status;
    error.cause = cause;
    error.details = {
      contentType,
      url,
      bodySnippet: trimmed.slice(0, 240)
    };
    throw error;
  }
}
