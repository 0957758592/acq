import { normalizeTelemetryEvent, summarizeTelemetry, OUTPUT_MAX_PLATFORMS } from './telemetry.js';

const clock = { now: () => new Date('2026-08-08T00:00:00Z') };

describe('normalizeTelemetryEvent', () => {
  it('derives source from the kind prefix, defaults outcome, and coerces metrics to finite numbers', () => {
    const e = normalizeTelemetryEvent({ platform: 'tiktok', kind: 'scrape.messages', accountId: 'a1', target: '@x', metrics: { itemsOut: 12, latencyMs: '340', bogus: 'nope' } }, { clock });
    expect(e).toMatchObject({ platform: 'tiktok', source: 'scrape', kind: 'scrape.messages', accountId: 'a1', target: '@x', outcome: 'ok', tenantId: 'default' });
    expect(e.metrics).toEqual({ itemsOut: 12, latencyMs: 340 }); // bogus dropped, string coerced
    expect(e.ts).toEqual(clock.now());
  });
  it('keeps an explicit source/outcome and rejects an unknown outcome to ok', () => {
    expect(normalizeTelemetryEvent({ platform: 'ig', kind: 'action.comment', source: 'action', outcome: 'partial' }).outcome).toBe('partial');
    expect(normalizeTelemetryEvent({ platform: 'ig', kind: 'action.comment', outcome: 'weird' }).outcome).toBe('ok');
  });
  it('requires platform and kind', () => {
    expect(() => normalizeTelemetryEvent({ kind: 'x.y' })).toThrow(/TELEMETRY_PLATFORM_REQUIRED/);
    expect(() => normalizeTelemetryEvent({ platform: 'tiktok' })).toThrow(/TELEMETRY_KIND_REQUIRED/);
  });
});

describe('summarizeTelemetry', () => {
  const events = [
    { outcome: 'ok', metrics: { impressions: 1000, likes: 50, comments: 5, itemsOut: 20 } },
    { outcome: 'ok', metrics: { impressions: 2000, likes: 90, comments: 8, itemsOut: 30 } },
    { outcome: 'failed', metrics: { impressions: 0, errors: 1 } }
  ];

  it('for tiktok/instagram focuses on OUTPUT produced (reach/engagement) and computes an outputScore', () => {
    const s = summarizeTelemetry(events, { platform: 'tiktok' });
    expect(s.outputMax).toBe(true);
    expect(s.totals.impressions).toBe(3000);
    expect(s.totals.likes).toBe(140);
    // focus == output keys; outputScore == sum of the output bundle
    expect(s.focus.impressions).toBe(3000);
    expect(s.focus.likes).toBe(140);
    expect(s.focus.comments).toBe(13);
    expect(s.outputScore).toBe(3000 + 140 + 13); // impressions+likes+comments (others 0)
    expect(s.outcomes).toEqual({ ok: 2, partial: 0, failed: 1 });
    expect(s.errorRate).toBeCloseTo(1 / 3);
  });

  it('for non-output-max platforms focuses on throughput, not engagement', () => {
    const s = summarizeTelemetry(events, { platform: 'telegram' });
    expect(s.outputMax).toBe(false);
    expect(s.focus.itemsOut).toBe(50);
    expect(s.focus).not.toHaveProperty('likes');
    expect(s.totals.likes).toBe(140); // totals still carry everything
  });

  it('an empty batch summarizes to zeros with a 0 error rate', () => {
    const s = summarizeTelemetry([], { platform: 'instagram' });
    expect(s.events).toBe(0);
    expect(s.outputScore).toBe(0);
    expect(s.errorRate).toBe(0);
  });

  it('exposes the output-max platform set', () => {
    expect(OUTPUT_MAX_PLATFORMS.has('tiktok')).toBe(true);
    expect(OUTPUT_MAX_PLATFORMS.has('instagram')).toBe(true);
    expect(OUTPUT_MAX_PLATFORMS.has('telegram')).toBe(false);
  });
});
