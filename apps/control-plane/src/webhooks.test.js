import crypto from 'node:crypto';

import { signWebhook, verifyWebhookSignature, isFreshTimestamp, createWebhookProcessor } from './webhooks.js';

const SECRET = 'whsec_test';
const clock = { now: () => new Date('2026-07-22T12:00:00.000Z') };
const TS = '1784721600'; // 2026-07-22T12:00:00Z in seconds

describe('webhook signature', () => {
  test('verify accepts a correctly-signed payload', () => {
    const body = '{"event":"x"}';
    const sig = signWebhook(TS, body, SECRET);
    expect(verifyWebhookSignature(TS, body, sig, SECRET)).toBe(true);
  });

  test('verify rejects a tampered payload', () => {
    const sig = signWebhook(TS, '{"event":"x"}', SECRET);
    expect(verifyWebhookSignature(TS, '{"event":"y"}', sig, SECRET)).toBe(false);
  });

  test('verify rejects a wrong secret', () => {
    const sig = crypto.createHmac('sha256', 'other').update(`${TS}.body`).digest('hex');
    expect(verifyWebhookSignature(TS, 'body', sig, SECRET)).toBe(false);
  });
});

describe('isFreshTimestamp (replay protection)', () => {
  test('accepts a recent timestamp', () => {
    expect(isFreshTimestamp(TS, { now: clock.now(), toleranceSec: 300 })).toBe(true);
  });
  test('rejects an old timestamp', () => {
    expect(isFreshTimestamp('1774100000', { now: clock.now(), toleranceSec: 300 })).toBe(false);
  });
});

describe('createWebhookProcessor', () => {
  const facade = { execute: async (op, { args }) => ({ data: { op, args }, error: null, meta: {} }) };
  function build() {
    const seen = new Set();
    return createWebhookProcessor({
      facade,
      secret: SECRET,
      clock,
      seenStore: { has: (id) => seen.has(id), add: (id) => seen.add(id) },
      role: 'brain'
    });
  }

  test('rejects an invalid signature (401-like)', async () => {
    const res = await build().process({ id: 'e1', operation: 'reconcile.now', args: {} }, { timestamp: TS, signature: 'bad', rawBody: 'x' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('invalid-signature');
  });

  test('rejects a replayed (stale) timestamp', async () => {
    const body = JSON.stringify({ id: 'e2', operation: 'reconcile.now', args: {} });
    const res = await build().process(JSON.parse(body), { timestamp: '1774100000', signature: signWebhook('1774100000', body, SECRET), rawBody: body });
    expect(res.reason).toBe('stale-timestamp');
  });

  test('executes a valid webhook once; a duplicate id is deduped', async () => {
    const proc = build();
    const body = JSON.stringify({ id: 'e3', operation: 'reconcile.now', args: { platform: 'telegram' } });
    const sig = signWebhook(TS, body, SECRET);
    const first = await proc.process(JSON.parse(body), { timestamp: TS, signature: sig, rawBody: body });
    expect(first.ok).toBe(true);
    const dup = await proc.process(JSON.parse(body), { timestamp: TS, signature: sig, rawBody: body });
    expect(dup.reason).toBe('duplicate');
  });
});
