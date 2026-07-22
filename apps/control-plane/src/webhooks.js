import crypto from 'node:crypto';

// Inbound webhook security (TZ §11.5, REQUIREM §9.2): HMAC-SHA256 signature over
// `${timestamp}.${rawBody}`, replay protection via a fresh-timestamp window, and
// idempotency via a seen-id store. All three must pass before the facade runs.
export function signWebhook(timestamp, rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function verifyWebhookSignature(timestamp, rawBody, signature, secret) {
  const expected = signWebhook(timestamp, rawBody, secret);
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isFreshTimestamp(timestamp, { now, toleranceSec = 300 } = {}) {
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs)) return false;
  return Math.abs(now.getTime() - tsMs) <= toleranceSec * 1000;
}

export function createWebhookProcessor({ facade, secret, clock, seenStore, role = 'brain', toleranceSec = 300 } = {}) {
  return {
    async process(body, { timestamp, signature, rawBody } = {}) {
      if (!verifyWebhookSignature(timestamp, rawBody, signature, secret)) {
        return { ok: false, reason: 'invalid-signature' };
      }
      if (!isFreshTimestamp(timestamp, { now: clock.now(), toleranceSec })) {
        return { ok: false, reason: 'stale-timestamp' };
      }
      if (seenStore.has(body.id)) {
        return { ok: false, reason: 'duplicate' };
      }
      seenStore.add(body.id);
      const envelope = await facade.execute(body.operation, { role, args: body.args ?? {}, correlationId: body.id });
      return { ok: !envelope.error, envelope };
    }
  };
}
