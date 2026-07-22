import { createEncryptedCookieSessionStore } from './cookie-session-store.js';

const KEY = Buffer.alloc(32, 7); // 32-byte AES-256 key
let clockTime;
const clock = { now: () => new Date(clockTime) };

beforeEach(() => {
  clockTime = '2026-07-22T00:00:00.000Z';
});

describe('createEncryptedCookieSessionStore', () => {
  it('round-trips cookies through encryption (not stored in clear)', async () => {
    const backing = new Map();
    const store = createEncryptedCookieSessionStore({ key: KEY, clock, backing });
    await store.put('darkshop', 'sid=abc123; auth=xyz', { expiresAt: '2026-07-23T00:00:00.000Z' });

    // Backing store must NOT contain the plaintext.
    const rawBlob = JSON.stringify([...backing.values()]);
    expect(rawBlob).not.toContain('sid=abc123');

    expect(await store.get('darkshop')).toBe('sid=abc123; auth=xyz');
  });

  it('isValid is true before expiry, false after', async () => {
    const store = createEncryptedCookieSessionStore({ key: KEY, clock });
    await store.put('s', 'c', { expiresAt: '2026-07-22T01:00:00.000Z' });
    expect(await store.isValid('s')).toBe(true);
    clockTime = '2026-07-22T02:00:00.000Z';
    expect(await store.isValid('s')).toBe(false);
  });

  it('get returns null and isValid false for an unknown shop', async () => {
    const store = createEncryptedCookieSessionStore({ key: KEY, clock });
    expect(await store.get('nope')).toBeNull();
    expect(await store.isValid('nope')).toBe(false);
  });

  it('get on an expired session returns null (COOKIE_SESSION_EXPIRED semantics)', async () => {
    const store = createEncryptedCookieSessionStore({ key: KEY, clock });
    await store.put('s', 'c', { expiresAt: '2026-07-22T00:30:00.000Z' });
    clockTime = '2026-07-22T01:00:00.000Z';
    expect(await store.get('s')).toBeNull();
  });
});
