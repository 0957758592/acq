import { selectTier, SCRAPE_TIERS } from './tier-router.js';

describe('SCRAPE_TIERS', () => {
  test('lists the four hybrid tiers', () => {
    expect(SCRAPE_TIERS).toEqual(expect.arrayContaining(['browser', 'http', 'device', 'api']));
  });
});

describe('selectTier', () => {
  test('app-only data routes to the on-device tier', () => {
    expect(selectTier({ appOnly: true })).toBe('device');
  });

  test('a stable API (no login needed) routes to the api tier', () => {
    expect(selectTier({ hasApi: true, needsLogin: false })).toBe('api');
  });

  test('simple public small data routes to the fast anon-http tier', () => {
    expect(selectTier({ needsLogin: false, volume: 'small' })).toBe('http');
  });

  test('login-gated data routes to the browser tier (primary)', () => {
    expect(selectTier({ needsLogin: true, volume: 'small' })).toBe('browser');
  });

  test('large-volume public data routes to the browser tier', () => {
    expect(selectTier({ needsLogin: false, volume: 'large' })).toBe('browser');
  });

  test('app-only wins over an available API', () => {
    expect(selectTier({ appOnly: true, hasApi: true })).toBe('device');
  });

  test('defaults to browser when nothing else matches', () => {
    expect(selectTier({})).toBe('browser');
  });
});
