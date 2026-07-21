import {
  DEVICE_PROVIDER_REQUIRED_METHODS,
  assertDeviceProviderContract,
  createDeviceProvider
} from '../index.js';
import { DeviceControlError } from '../errors.js';

function stubProvider(overrides = {}) {
  const base = { type: 'fake' };
  for (const m of DEVICE_PROVIDER_REQUIRED_METHODS) base[m] = () => {};
  return { ...base, ...overrides };
}

const vmosCfg = { type: 'vmos', accessKey: 'ak', secretKey: 'sk', fetch: async () => ({}) };
const duoplusCfg = { type: 'duoplus', apiKey: 'key', fetchImpl: async () => ({}) };

describe('DEVICE_PROVIDER_REQUIRED_METHODS', () => {
  test('declares the core port surface every adapter must implement', () => {
    expect(DEVICE_PROVIDER_REQUIRED_METHODS).toEqual(
      expect.arrayContaining([
        'listDevices',
        'describeInstance',
        'startDevice',
        'stopDevice',
        'createDirectController',
        'screenshot',
        'setSmartIp'
      ])
    );
  });
});

describe('assertDeviceProviderContract', () => {
  test('passes a well-formed provider', () => {
    expect(() => assertDeviceProviderContract(stubProvider())).not.toThrow();
  });

  test('throws DEVICE_PROVIDER_CONTRACT_VIOLATION naming the missing method', () => {
    const provider = stubProvider();
    delete provider.setSmartIp;
    try {
      assertDeviceProviderContract(provider);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DeviceControlError);
      expect(err.code).toBe('DEVICE_PROVIDER_CONTRACT_VIOLATION');
      expect(err.message).toContain('setSmartIp');
    }
  });

  test('throws when type is missing', () => {
    const provider = stubProvider({ type: undefined });
    try {
      assertDeviceProviderContract(provider);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('DEVICE_PROVIDER_CONTRACT_VIOLATION');
    }
  });
});

describe('createDeviceProvider (generalized factory)', () => {
  test('builds a vmos provider that satisfies the contract', () => {
    const provider = createDeviceProvider(vmosCfg);
    expect(provider.type).toBe('vmos');
    expect(() => assertDeviceProviderContract(provider)).not.toThrow();
  });

  test('builds a duoplus provider that satisfies the contract', () => {
    const provider = createDeviceProvider(duoplusCfg);
    expect(provider.type).toBe('duoplus');
    expect(() => assertDeviceProviderContract(provider)).not.toThrow();
  });

  test('throws UNSUPPORTED_PROVIDER for an unknown type', () => {
    try {
      createDeviceProvider({ type: 'nope' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('UNSUPPORTED_PROVIDER');
    }
  });
});

describe('provider capabilities (honest optional-method surface)', () => {
  test('vmos supports pushFileByUrl but not native provisionApps', () => {
    const provider = createDeviceProvider(vmosCfg);
    expect(provider.capabilities.pushFileByUrl).toBe(true);
    expect(provider.capabilities.provisionApps).toBe(false);
  });

  test('duoplus supports provisionApps but not pushFileByUrl', () => {
    const provider = createDeviceProvider(duoplusCfg);
    expect(provider.capabilities.provisionApps).toBe(true);
    expect(provider.capabilities.pushFileByUrl).toBe(false);
  });
});
