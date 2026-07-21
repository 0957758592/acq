import https from 'node:https';

import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export function buildProxyUrl(endpoint = {}) {
  const protocol = endpoint.protocol || 'http';
  const auth =
    endpoint.username || endpoint.password
      ? `${encodeURIComponent(endpoint.username || '')}:${encodeURIComponent(endpoint.password || '')}@`
      : '';
  return `${protocol}://${auth}${endpoint.host}:${endpoint.port}`;
}

export async function verifyProxy(endpoint, { timeoutMs = 15_000, checkUrl = 'https://api.ipify.org?format=json' } = {}) {
  if (!endpoint?.host || !endpoint?.port) throw new Error('Proxy endpoint host and port are required');
  return new Promise((resolve, reject) => {
    const proxyUrl = buildProxyUrl(endpoint);
    const agent = String(endpoint.protocol || '').startsWith('socks')
      ? new SocksProxyAgent(proxyUrl)
      : new HttpsProxyAgent(proxyUrl);
    const request = https.get(checkUrl, { agent, timeout: timeoutMs, headers: { Accept: 'application/json,text/plain' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Proxy check failed ${response.statusCode}: ${body}`));
          return;
        }
        const parsed = body.trim().startsWith('{') ? JSON.parse(body) : { ip: body.trim() };
        resolve({ success: true, effectiveIp: parsed.ip || parsed.origin || body.trim() });
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Proxy check timed out after ${timeoutMs}ms`));
    });
    request.on('error', reject);
  });
}
