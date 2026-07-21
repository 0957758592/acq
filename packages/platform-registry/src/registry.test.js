import {
  getPlatformCapabilities,
  listPlatforms,
  isSupportedAction,
  resolveAppPackage,
  registerPlatform
} from './registry.js';
import { PlatformRegistryError } from './errors.js';

describe('getPlatformCapabilities', () => {
  test('returns the frozen whatsapp descriptor', () => {
    const caps = getPlatformCapabilities('whatsapp');
    expect(caps.platform).toBe('whatsapp');
    expect(caps.appPackage).toBe('com.whatsapp');
    expect(caps.identifierVO).toBe('msisdn');
    expect(caps.onlineMethod).toBe('session-import');
    expect(Object.isFrozen(caps)).toBe(true);
  });

  test('is case-insensitive and trims the platform key', () => {
    expect(getPlatformCapabilities('  WhatsApp ').platform).toBe('whatsapp');
  });

  test('throws PLATFORM_UNKNOWN for an unregistered platform', () => {
    expect(() => getPlatformCapabilities('myspace')).toThrow(PlatformRegistryError);
    try {
      getPlatformCapabilities('myspace');
    } catch (err) {
      expect(err.code).toBe('PLATFORM_UNKNOWN');
    }
  });
});

describe('listPlatforms', () => {
  test('includes whatsapp', () => {
    expect(listPlatforms()).toContain('whatsapp');
  });
});

describe('isSupportedAction', () => {
  test('true for a declared action', () => {
    expect(isSupportedAction('whatsapp', 'report')).toBe(true);
  });

  test('false for an undeclared action', () => {
    expect(isSupportedAction('whatsapp', 'publish')).toBe(false);
  });
});

describe('resolveAppPackage', () => {
  test('returns the platform app package (no com.whatsapp hardcode downstream)', () => {
    expect(resolveAppPackage('whatsapp')).toBe('com.whatsapp');
  });
});

describe('registerPlatform (Open/Closed extension)', () => {
  const descriptor = {
    platform: 'telegram',
    accountKind: 'phone',
    identifierVO: 'msisdn',
    appPackage: 'org.telegram.messenger',
    appCatalogName: 'Telegram',
    supportedActions: ['join', 'dm'],
    onlineMethod: 'login',
    signupVia: 'phone',
    maxAccountsPerDevice: 1,
    stateVocabulary: { logged_in: 'online', banned: 'banned', logged_out: 'logged_out' },
    scrapeTargets: ['channel', 'members']
  };

  test('registers a new platform without touching existing ones', () => {
    registerPlatform(descriptor);
    expect(getPlatformCapabilities('telegram').appPackage).toBe('org.telegram.messenger');
    expect(getPlatformCapabilities('whatsapp').platform).toBe('whatsapp');
  });

  test('rejects a descriptor missing required fields', () => {
    expect(() => registerPlatform({ platform: 'broken' })).toThrow(PlatformRegistryError);
    try {
      registerPlatform({ platform: 'broken' });
    } catch (err) {
      expect(err.code).toBe('DESCRIPTOR_INVALID');
    }
  });

  test('rejects duplicate registration of the same platform', () => {
    expect(() => registerPlatform(descriptor)).toThrow(PlatformRegistryError);
    try {
      registerPlatform(descriptor);
    } catch (err) {
      expect(err.code).toBe('PLATFORM_ALREADY_REGISTERED');
    }
  });
});
