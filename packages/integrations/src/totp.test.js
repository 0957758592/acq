import { generateTOTP, base32Decode, totpCandidates } from './totp.js';

// RFC 4226 Appendix D test vectors: secret "12345678901234567890" (ASCII),
// HOTP for counters 0..9. With a 30s step, counter N ⇔ now = N*30000 ms.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32 of the ASCII seed
const VECTORS = [
  '755224', '287082', '359152', '969429', '338314',
  '254676', '287922', '162583', '399871', '520489'
];

test('generateTOTP matches RFC 4226 vectors per 30s window', () => {
  VECTORS.forEach((expected, counter) => {
    expect(generateTOTP(SECRET, { now: counter * 30_000 })).toBe(expected);
  });
});

test('base32Decode recovers the ASCII seed', () => {
  expect(base32Decode(SECRET).toString('utf8')).toBe('12345678901234567890');
});

test('base32Decode tolerates spaces, hyphens and padding', () => {
  expect(generateTOTP('GEZD GNBV-GY3T-QOJQ GEZD GNBV GY3T QOJQ', { now: 30_000 })).toBe('287082');
});

test('offset selects the next window', () => {
  expect(generateTOTP(SECRET, { now: 0, offset: 1 })).toBe('287082'); // == counter 1
});

test('totpCandidates returns [current, next]', () => {
  expect(totpCandidates(SECRET, { now: 0 })).toEqual(['755224', '287082']);
});

test('throws on empty / invalid secret', () => {
  expect(() => generateTOTP('')).toThrow();
  expect(() => generateTOTP('--')).toThrow();
});
