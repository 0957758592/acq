import { domainError } from './errors.js';

const E164 = /^\+[1-9]\d{6,14}$/;

export function normalizeMsisdn(input) {
  if (typeof input !== 'string') {
    throw domainError('MSISDN_INVALID', 'MSISDN must be a string');
  }
  let cleaned = input.trim().replace(/[\s()\-.]/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (!cleaned.startsWith('+')) cleaned = `+${cleaned}`;
  if (!E164.test(cleaned)) {
    throw domainError('MSISDN_INVALID', `MSISDN is not valid E.164: ${input}`);
  }
  return cleaned;
}

export function createMsisdn(input) {
  const value = normalizeMsisdn(input);
  return Object.freeze({
    value,
    equals(other) {
      return Boolean(other) && other.value === value;
    }
  });
}
