import { EngineTelemetry, TELEMETRY_OUTCOMES } from './engine-telemetry.model.js';

describe('EngineTelemetry model', () => {
  it('validates clean with platform + kind and sensible defaults', () => {
    const doc = new EngineTelemetry({ platform: 'tiktok', kind: 'scrape.messages' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.tenantId).toBe('default');
    expect(doc.outcome).toBe('ok');
    expect(doc.accountId).toBeNull();
    expect(doc.ts).toBeInstanceOf(Date);
  });
  it('requires platform and kind', () => {
    expect(new EngineTelemetry({}).validateSync()).toBeDefined();
    expect(new EngineTelemetry({ platform: 'ig' }).validateSync()).toBeDefined();
  });
  it('rejects an unknown outcome', () => {
    expect(new EngineTelemetry({ platform: 'ig', kind: 'x.y', outcome: 'weird' }).validateSync()).toBeDefined();
  });
  it('carries free-form metrics as Mixed (reach/engagement/latency/cost)', () => {
    const doc = new EngineTelemetry({ platform: 'instagram', kind: 'action.comment', metrics: { comments: 3, latencyMs: 820 } });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.metrics.comments).toBe(3);
  });
  it('exposes the outcomes', () => {
    expect(TELEMETRY_OUTCOMES).toEqual(expect.arrayContaining(['ok', 'partial', 'failed']));
  });
});
