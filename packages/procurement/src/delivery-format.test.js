import { extractDelivered } from './delivery-format.js';
import { DomainError } from '@acq/engine-domain';

describe('extractDelivered — verify-by-fact gate', () => {
  test('throws PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED while the format is unverified', () => {
    try {
      extractDelivered([{ phone: '+1', pass: 'x' }], { verified: false, format: 'json-array', itemMap: {} });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe('PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED');
    }
  });
});

describe('extractDelivered — json-array format', () => {
  const spec = {
    verified: true,
    format: 'json-array',
    itemMap: { identifier: 'phone', 'secrets.session': 'session', 'secrets.password': 'pass' }
  };

  test('maps each element to identifier + raw secrets (to be vaulted by the caller)', () => {
    const blob = [
      { phone: '+15551230001', session: 's1', pass: 'p1' },
      { phone: '+15551230002', session: 's2', pass: 'p2' }
    ];
    const out = extractDelivered(blob, spec);
    expect(out).toEqual([
      { identifier: '+15551230001', secrets: { session: 's1', password: 'p1' } },
      { identifier: '+15551230002', secrets: { session: 's2', password: 'p2' } }
    ]);
  });
});

describe('extractDelivered — lines format', () => {
  const spec = {
    verified: true,
    format: 'lines',
    separator: ':',
    identifierIndex: 0,
    secrets: { password: 1, session: 2 }
  };

  test('splits each line into identifier + secrets', () => {
    const blob = '+15551230001:p1:s1\n+15551230002:p2:s2';
    const out = extractDelivered(blob, spec);
    expect(out).toEqual([
      { identifier: '+15551230001', secrets: { password: 'p1', session: 's1' } },
      { identifier: '+15551230002', secrets: { password: 'p2', session: 's2' } }
    ]);
  });

  test('ignores blank lines', () => {
    expect(extractDelivered('+1:p\n\n  \n', spec)).toHaveLength(1);
  });
});

describe('extractDelivered — unknown format', () => {
  test('throws PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED for an unrecognized format', () => {
    try {
      extractDelivered('x', { verified: true, format: 'martian' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED');
    }
  });
});
