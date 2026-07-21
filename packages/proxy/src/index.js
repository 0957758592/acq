export { assignProxy, releaseProxy } from './domain/assignment.js';
export { isGeoConsistent, assertGeoConsistent } from './domain/geo.js';
export { isHealthy, needsRotation, selectHealthyProxy } from './domain/health.js';
export { PROXY_PROVIDER_METHODS } from './ports.js';
export { ProxyError, proxyError } from './errors.js';
