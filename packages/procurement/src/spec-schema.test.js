import { validateShopSpec, AUTH_KINDS } from './spec-schema.js';
import { DomainError } from '@acq/engine-domain';

function validSpec(overrides = {}) {
  return {
    shopId: 'darkshop',
    baseUrl: 'https://dark.shopping',
    title: 'Dark Shopping',
    auth: { kind: 'cookie-session', config: {} },
    endpoints: {
      balance: { method: 'GET', path: '/balance', responseMap: { balanceUsdCents: 'data.balance' } },
      offers: { method: 'GET', path: '/offers', responseMap: {} },
      purchase: { method: 'POST', path: '/buy', responseMap: { orderId: 'data.order' } },
      delivery: { method: 'GET', path: '/delivery', responseMap: {}, deliveryFormat: { verified: false, format: 'lines' } }
    },
    verified: false,
    ...overrides
  };
}

describe('validateShopSpec', () => {
  test('accepts a well-formed spec and defaults verified to false', () => {
    const spec = validSpec();
    delete spec.verified;
    const out = validateShopSpec(spec);
    expect(out.shopId).toBe('darkshop');
    expect(out.verified).toBe(false);
  });

  test('rejects an unknown auth kind', () => {
    try {
      validateShopSpec(validSpec({ auth: { kind: 'telepathy', config: {} } }));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe('SHOP_SPEC_INVALID');
    }
  });

  test('rejects a missing required field (baseUrl)', () => {
    const spec = validSpec();
    delete spec.baseUrl;
    expect(() => validateShopSpec(spec)).toThrow('SHOP_SPEC_INVALID');
  });

  test('rejects unknown top-level fields (reject-unknown)', () => {
    expect(() => validateShopSpec(validSpec({ sneaky: true }))).toThrow('SHOP_SPEC_INVALID');
  });

  test('exposes the supported auth kinds', () => {
    expect(AUTH_KINDS).toEqual(
      expect.arrayContaining(['api-key', 'bearer', 'cookie-session', 'oauth2', 'login-password'])
    );
  });
});
