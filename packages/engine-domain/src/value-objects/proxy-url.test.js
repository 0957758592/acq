import { parseProxyUrl } from './proxy-url.js';

describe('parseProxyUrl', () => {
  it('splits scheme://host:port without credentials', () => {
    expect(parseProxyUrl('http://host:8080')).toEqual({ server: 'http://host:8080', auth: null });
  });

  it('extracts credentials into a separate auth object (server carries no creds)', () => {
    expect(parseProxyUrl('http://user:pass@host:8080')).toEqual({
      server: 'http://host:8080',
      auth: { username: 'user', password: 'pass' }
    });
  });

  it('URL-decodes credentials', () => {
    expect(parseProxyUrl('http://u%40x:p%3Aw@host:1')).toEqual({
      server: 'http://host:1',
      auth: { username: 'u@x', password: 'p:w' }
    });
  });

  it('supports socks schemes', () => {
    expect(parseProxyUrl('socks5://host:1080').server).toBe('socks5://host:1080');
  });

  it('returns nulls for an empty proxy', () => {
    expect(parseProxyUrl('')).toEqual({ server: null, auth: null });
    expect(parseProxyUrl(undefined)).toEqual({ server: null, auth: null });
  });

  it('falls back to the raw string when it is not a URL', () => {
    expect(parseProxyUrl('host:8080')).toEqual({ server: 'host:8080', auth: null });
  });
});
