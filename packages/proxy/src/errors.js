export class ProxyError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'ProxyError';
    this.code = code;
  }
}

export function proxyError(code, message) {
  return new ProxyError(code, message);
}
