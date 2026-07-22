import { buildCsp } from './csp.js';

describe('buildCsp', () => {
  test('locks scripts/objects down and allows the control-plane as connect-src', () => {
    const csp = buildCsp({ apiOrigin: 'https://cp.example' });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://cp.example');
  });

  test('never contains unsafe-inline for scripts', () => {
    expect(buildCsp({ apiOrigin: 'self' })).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
});
