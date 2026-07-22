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
  test('includes the built-in platforms', () => {
    expect(listPlatforms()).toEqual(expect.arrayContaining(['whatsapp', 'telegram']));
  });
});

describe('built-in telegram descriptor', () => {
  test('is registered with the expected capabilities', () => {
    const caps = getPlatformCapabilities('telegram');
    expect(caps.appPackage).toBe('org.telegram.messenger');
    expect(caps.identifierVO).toBe('msisdn');
    expect(caps.supportedActions).toEqual(expect.arrayContaining(['join', 'dm', 'report', 'view']));
    expect(caps.scrapeTargets).toEqual(expect.arrayContaining(['channel', 'group', 'members']));
  });
});

describe('built-in discord descriptor', () => {
  test('is registered with the expected capabilities', () => {
    const caps = getPlatformCapabilities('discord');
    expect(caps.appPackage).toBe('com.discord');
    expect(caps.supportedActions).toEqual(expect.arrayContaining(['join', 'dm', 'report']));
    expect(caps.scrapeTargets).toEqual(expect.arrayContaining(['server', 'channel', 'members']));
  });
});

describe('built-in facebook descriptor', () => {
  test('is registered with the expected capabilities', () => {
    const caps = getPlatformCapabilities('facebook');
    expect(caps.appPackage).toBe('com.facebook.katana');
    expect(caps.supportedActions).toEqual(expect.arrayContaining(['post', 'join', 'report', 'like']));
    expect(caps.scrapeTargets).toEqual(expect.arrayContaining(['page', 'group', 'friends']));
  });
});

describe('built-in gmail descriptor', () => {
  test('is the signup anchor / code reader', () => {
    const caps = getPlatformCapabilities('gmail');
    expect(caps.appPackage).toBe('com.google.android.gm');
    expect(caps.identifierVO).toBe('email');
    expect(caps.supportedActions).toEqual(['read-code']);
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
  // A platform that is NOT a built-in, to exercise dynamic registration.
  const descriptor = {
    platform: 'signal',
    accountKind: 'phone',
    identifierVO: 'msisdn',
    appPackage: 'org.thoughtcrime.securesms',
    appCatalogName: 'Signal',
    supportedActions: ['dm'],
    onlineMethod: 'login',
    signupVia: 'phone',
    maxAccountsPerDevice: 1,
    stateVocabulary: { logged_in: 'online', banned: 'banned', logged_out: 'logged_out' },
    scrapeTargets: ['members']
  };

  test('registers a new platform without touching existing ones', () => {
    registerPlatform(descriptor);
    expect(getPlatformCapabilities('signal').appPackage).toBe('org.thoughtcrime.securesms');
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
