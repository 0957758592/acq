import { extractPath, applyResponseMap } from './response-map.js';

describe('extractPath (dot/bracket JSONPath-lite)', () => {
  const obj = { data: { balance: 1234, items: [{ id: 'o1' }, { id: 'o2' }] } };

  test('reads a nested dotted path', () => {
    expect(extractPath(obj, 'data.balance')).toBe(1234);
  });

  test('reads an array index', () => {
    expect(extractPath(obj, 'data.items[1].id')).toBe('o2');
  });

  test('supports a leading $ root', () => {
    expect(extractPath(obj, '$.data.balance')).toBe(1234);
  });

  test('returns undefined for a missing path (no throw)', () => {
    expect(extractPath(obj, 'data.missing.deep')).toBeUndefined();
  });
});

describe('applyResponseMap', () => {
  test('maps each output field via its path', () => {
    const raw = { result: { credit: 500 }, order: { ref: 'X1' } };
    const out = applyResponseMap(raw, { balanceUsdCents: 'result.credit', orderId: 'order.ref' });
    expect(out).toEqual({ balanceUsdCents: 500, orderId: 'X1' });
  });

  test('omits fields whose path is absent', () => {
    const out = applyResponseMap({ a: 1 }, { x: 'a', y: 'missing' });
    expect(out).toEqual({ x: 1 });
  });
});
