import { parseDelivery } from './keystore-delivery.js';

// Shapes verified by fact against three real dark.shopping deliveries (values here
// are synthetic — never the real credentials).
test('parses a colon-separated 7-field line: identifier=first, raw preserved', () => {
  const [acc] = parseDelivery('user1:pass1:mail@x.com:mailpass:2fasecret:cookieA:tokenB');
  expect(acc.identifier).toBe('user1');
  expect(acc.separator).toBe(':');
  expect(acc.fieldCount).toBe(7);
  expect(acc.secrets.raw).toBe('user1:pass1:mail@x.com:mailpass:2fasecret:cookieA:tokenB');
  expect(acc.secrets.fields).toHaveLength(7);
});

test('detects TAB-separated 3-field delivery', () => {
  const [acc] = parseDelivery('userT\tpassT\tmail@t.com');
  expect(acc.separator).toBe('\t');
  expect(acc.fieldCount).toBe(3);
  expect(acc.identifier).toBe('userT');
});

test('parses a colon-separated 3-field line', () => {
  const [acc] = parseDelivery('userC:passC:mail@c.com');
  expect(acc.separator).toBe(':');
  expect(acc.fieldCount).toBe(3);
});

test('parses multiple lines into multiple accounts and skips blanks', () => {
  const accs = parseDelivery('a:b:c\n\n d:e:f \n');
  expect(accs).toHaveLength(2);
  expect(accs.map((x) => x.identifier)).toEqual(['a', 'd']);
});

test('an opaque single-token line keeps the whole token as identifier + raw', () => {
  const [acc] = parseDelivery('SINGLETOKEN12345');
  expect(acc.separator).toBeNull();
  expect(acc.fieldCount).toBe(1);
  expect(acc.identifier).toBe('SINGLETOKEN12345');
  expect(acc.secrets.raw).toBe('SINGLETOKEN12345');
});

test('empty blob yields no accounts', () => {
  expect(parseDelivery('')).toEqual([]);
  expect(parseDelivery(null)).toEqual([]);
});
