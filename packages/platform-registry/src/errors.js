export class PlatformRegistryError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'PlatformRegistryError';
    this.code = code;
  }
}

export function platformRegistryError(code, message) {
  return new PlatformRegistryError(code, message);
}
