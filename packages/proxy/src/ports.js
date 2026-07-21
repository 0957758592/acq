/**
 * ProxyProvider port (TZ §4/§5.9) — the inward contract every proxy vendor
 * adapter implements. Adapters (VMOS dynamic-proxy, 922proxy, IPRoyal,
 * BrightData, Smartproxy, Oxylabs, …) live outside the domain and are injected
 * in the composition root. Secrets (user:pass/endpoint) are held in vault; the
 * port surfaces only ids and health facts.
 *
 * @typedef {'residential'|'mobile'|'datacenter'} ProxyType
 *
 * @typedef {Object} ProxyHealth
 * @property {boolean} ok
 * @property {string} [ip]
 * @property {string} [geo]
 * @property {number} [latencyMs]
 *
 * @typedef {Object} ProxyProvider
 * @property {() => Promise<Array<Object>>} listProxies
 * @property {(input: { type: ProxyType, geo: string, gb?: number }) => Promise<{ proxyId: string }>} purchase
 * @property {(proxyId: string, deviceId: string) => Promise<void>} assign
 * @property {(proxyId: string) => Promise<void>} release
 * @property {(proxyId: string) => Promise<{ proxyId: string }>} rotate
 * @property {(proxyId: string) => Promise<ProxyHealth>} healthCheck
 */

export const PROXY_PROVIDER_METHODS = Object.freeze([
  'listProxies',
  'purchase',
  'assign',
  'release',
  'rotate',
  'healthCheck'
]);
