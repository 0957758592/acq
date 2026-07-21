import { isGeoConsistent, assertGeoConsistent } from './geo.js';
import { ProxyError } from '../errors.js';

describe('isGeoConsistent (IP<->SIM<->GPS<->timezone one fingerprint)', () => {
  test('true when all provided country facets agree', () => {
    expect(
      isGeoConsistent({ ipCountry: 'US', simCountry: 'US', gpsCountry: 'US', timezoneCountry: 'US' })
    ).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(isGeoConsistent({ ipCountry: 'us', simCountry: 'US' })).toBe(true);
  });

  test('ignores facets that are not provided', () => {
    expect(isGeoConsistent({ ipCountry: 'DE', simCountry: 'DE' })).toBe(true);
  });

  test('false when a facet disagrees', () => {
    expect(isGeoConsistent({ ipCountry: 'US', simCountry: 'GB' })).toBe(false);
  });

  test('false when no facets are provided (cannot prove consistency)', () => {
    expect(isGeoConsistent({})).toBe(false);
  });
});

describe('assertGeoConsistent', () => {
  test('passes silently when consistent', () => {
    expect(() => assertGeoConsistent({ ipCountry: 'US', gpsCountry: 'US' })).not.toThrow();
  });

  test('throws PROXY_GEO_MISMATCH when inconsistent', () => {
    try {
      assertGeoConsistent({ ipCountry: 'US', simCountry: 'RU' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProxyError);
      expect(err.code).toBe('PROXY_GEO_MISMATCH');
    }
  });
});
