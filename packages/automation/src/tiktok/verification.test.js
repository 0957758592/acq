import { jest } from '@jest/globals';
import { handleVerification } from './ui-flows.js';
import { totpCandidates } from '@acq/integrations';

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function fakeActor() {
  const typed = [];
  return {
    typed,
    async type(t) { typed.push(t); },
    async tapElement() {},
    async findAndTap() { return true; },
    async pause() {},
    async elements() { return []; }, // empty → visibleText '' → no rejection → no retry
    controller: { clearField() {} }
  };
}

test('uses an authenticator (TOTP) code when a seed is present, not email', async () => {
  const actor = fakeActor();
  const emailCodeFetcher = { fetchLatestCode: jest.fn() };
  const res = await handleVerification(actor, { totpSecret: SECRET, emailCodeFetcher });

  // a valid 6-digit TOTP for this secret (current or next window) was typed
  const candidates = totpCandidates(SECRET);
  expect(actor.typed.some((v) => candidates.includes(v))).toBe(true);
  // email path was NOT used
  expect(emailCodeFetcher.fetchLatestCode).not.toHaveBeenCalled();
  expect(res).toBeNull();
});

test('falls back to the email-code fetcher when no TOTP seed', async () => {
  const actor = fakeActor();
  const emailCodeFetcher = { fetchLatestCode: jest.fn().mockResolvedValue('123456') };
  const res = await handleVerification(actor, { totpSecret: '', emailCodeFetcher });

  expect(emailCodeFetcher.fetchLatestCode).toHaveBeenCalled();
  expect(actor.typed).toContain('123456');
  expect(res).toBeNull();
});

test('checkpoints when no seed and no email fetcher', async () => {
  const actor = fakeActor();
  const res = await handleVerification(actor, { totpSecret: '', emailCodeFetcher: null });
  expect(res).toMatchObject({ success: false, status: 'checkpointed' });
});
