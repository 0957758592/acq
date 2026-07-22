import { httpStatusFor, authenticate } from './http-mapping.js';

describe('httpStatusFor', () => {
  test.each([
    [null, 200],
    ['UNKNOWN_OPERATION', 404],
    ['NOT_FOUND', 404],
    ['FORBIDDEN', 403],
    ['UNAUTHORIZED', 401],
    ['CONFLICT', 409],
    ['NOT_IMPLEMENTED', 501],
    ['INTERNAL', 500],
    ['ACCOUNT_TRANSITION_INVALID', 400],
    ['PROCUREMENT_PRICE_DRIFT', 400]
  ])('maps %s -> %s', (code, status) => {
    expect(httpStatusFor(code)).toBe(status);
  });
});

describe('authenticate (constant-time bearer -> role)', () => {
  const tokens = { 'admin-tok': 'admin', 'ro-tok': 'readonly' };

  test('resolves a known token to its role', () => {
    expect(authenticate('Bearer admin-tok', { tokens })).toEqual({ role: 'admin', actor: 'admin-tok' });
  });

  test('returns null for an unknown token', () => {
    expect(authenticate('Bearer nope', { tokens })).toBeNull();
  });

  test('returns null when the header is missing or malformed', () => {
    expect(authenticate('', { tokens })).toBeNull();
    expect(authenticate('admin-tok', { tokens })).toBeNull();
  });
});
