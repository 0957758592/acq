import { createDeviceProvider } from '../index.js';
import { DeviceControlError } from '../errors.js';

// matt-duo has no confirmed cloud-phone auth/endpoints (TZ §5.8). The provider
// is a fail-safe verify-by-fact seam: it must NOT be constructible until a real,
// verified auth is supplied — building it blocks hard with a coded error rather
// than silently guessing.
describe('matt-duo verify-by-fact seam', () => {
  test('createDeviceProvider({type:"matt-duo"}) throws MATT_DUO_AUTH_UNVERIFIED', () => {
    try {
      createDeviceProvider({ type: 'matt-duo' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DeviceControlError);
      expect(err.code).toBe('MATT_DUO_AUTH_UNVERIFIED');
    }
  });

  test('does not fall through to UNSUPPORTED_PROVIDER (it is a known-but-unverified type)', () => {
    try {
      createDeviceProvider({ type: 'matt-duo' });
    } catch (err) {
      expect(err.code).not.toBe('UNSUPPORTED_PROVIDER');
    }
  });
});
