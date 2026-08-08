import { createFacade } from '@acq/control';
import { buildUseCases } from './use-cases.js';
import { buildValidators } from './validators.js';

// In-memory TelemetryRepo mirroring createMongoTelemetryRepo's contract.
function memTelemetryRepo() {
  const rows = [];
  return {
    rows,
    recordMany: async (events = []) => { rows.push(...events); return { inserted: events.length }; },
    query: async (f = {}) => rows.filter((e) =>
      (!f.platform || e.platform === f.platform) && (!f.kind || e.kind === f.kind) &&
      (!f.accountId || e.accountId === f.accountId) && (!f.outcome || e.outcome === f.outcome))
  };
}

function build() {
  const telemetryRepo = memTelemetryRepo();
  const ctx = { telemetryRepo, clock: { now: () => new Date('2026-08-08T00:00:00Z') } };
  const facade = createFacade({ useCases: buildUseCases(ctx), validators: buildValidators(), audit: { record: async () => {} } });
  return { facade, telemetryRepo };
}

describe('telemetry surface ops through the facade', () => {
  it('telemetry.record normalizes + persists a batch; readonly is forbidden', async () => {
    const { facade, telemetryRepo } = build();
    const forbidden = await facade.execute('telemetry.record', { role: 'readonly', args: { events: [{ platform: 'tiktok', kind: 'scrape.messages' }] } });
    expect(forbidden.error.code).toBe('FORBIDDEN');
    const ok = await facade.execute('telemetry.record', { role: 'operator', args: { events: [
      { platform: 'tiktok', kind: 'scrape.messages', metrics: { itemsOut: 10, latencyMs: '250' } },
      { platform: 'tiktok', kind: 'action.comment', outcome: 'ok', metrics: { comments: 2, impressions: 500 } }
    ] } });
    expect(ok.error).toBeNull();
    expect(ok.data.recorded).toBe(2);
    // normalized: source derived, string metric coerced
    expect(telemetryRepo.rows[0]).toMatchObject({ source: 'scrape', metrics: { itemsOut: 10, latencyMs: 250 } });
  });

  it('telemetry.record accepts a single event and requires at least one', async () => {
    const { facade } = build();
    const one = await facade.execute('telemetry.record', { role: 'brain', args: { event: { platform: 'instagram', kind: 'action.like', metrics: { likes: 1 } } } });
    expect(one.data.recorded).toBe(1);
    const none = await facade.execute('telemetry.record', { role: 'operator', args: {} });
    expect(none.error.code).toBe('EVENTS_REQUIRED');
  });

  it('telemetry.query is readable by all and filters', async () => {
    const { facade } = build();
    await facade.execute('telemetry.record', { role: 'operator', args: { events: [
      { platform: 'tiktok', kind: 'action.comment', metrics: { comments: 1 } },
      { platform: 'telegram', kind: 'scrape.messages', metrics: { itemsOut: 5 } }
    ] } });
    const res = await facade.execute('telemetry.query', { role: 'readonly', args: { platform: 'tiktok' } });
    expect(res.error).toBeNull();
    expect(res.data.events).toHaveLength(1);
    expect(res.data.events[0].kind).toBe('action.comment');
  });

  it('telemetry.summary rolls up OUTPUT for tiktok (produced reach/engagement) and throughput for telegram', async () => {
    const { facade } = build();
    await facade.execute('telemetry.record', { role: 'operator', args: { events: [
      { platform: 'tiktok', kind: 'action.comment', metrics: { impressions: 1000, comments: 3 } },
      { platform: 'tiktok', kind: 'action.like', metrics: { likes: 20 } }
    ] } });
    const tk = await facade.execute('telemetry.summary', { role: 'readonly', args: { platform: 'tiktok' } });
    expect(tk.data.outputMax).toBe(true);
    expect(tk.data.outputScore).toBe(1000 + 3 + 20);
    expect(tk.data.focus.impressions).toBe(1000);

    await facade.execute('telemetry.record', { role: 'operator', args: { events: [{ platform: 'telegram', kind: 'scrape.messages', metrics: { itemsOut: 40 } }] } });
    const tg = await facade.execute('telemetry.summary', { role: 'readonly', args: { platform: 'telegram' } });
    expect(tg.data.outputMax).toBe(false);
    expect(tg.data.focus.itemsOut).toBe(40);
  });
});
