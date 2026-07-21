import { domainError } from '../errors.js';

// Handle: @-prefixed username (telegram/tiktok/instagram/…). Letters, digits,
// underscore and dot; case-insensitive (stored lowercase).
const HANDLE_BODY = /^[a-z0-9_.]{1,64}$/;

export function normalizeHandle(input) {
  if (typeof input !== 'string') {
    throw domainError('HANDLE_INVALID', 'handle must be a string');
  }
  const body = input.trim().replace(/^@+/, '').toLowerCase();
  if (!HANDLE_BODY.test(body)) {
    throw domainError('HANDLE_INVALID', `handle is not valid: ${input}`);
  }
  return `@${body}`;
}
