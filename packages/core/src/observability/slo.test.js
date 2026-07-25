import { evaluateSlos } from './slo.js';

describe('evaluateSlos (TZ §15 SLO alerting + error budget)', () => {
  it('is healthy when every objective holds', () => {
    const r = evaluateSlos({ platforms: [{ platform: 'telegram', accountsOnline: 9, accountsBanned: 1, banShare: 0.1, devices: [{ deviceId: 'd1', saturation: 0.4 }] }], ops: { total: 100, errors: 2 } });
    expect(r.healthy).toBe(true);
    expect(r.alerts).toEqual([]);
    expect(r.errorBudget.remaining).toBeCloseTo(0.9, 5);
  });

  it('alerts on the four §15 signals: DLQ growth, online-share drop, spend cap, vendor circuit open', () => {
    const r = evaluateSlos({
      platforms: [{ platform: 'telegram', accountsOnline: 1, accountsBanned: 9, banShare: 0.9, devices: [] }],
      dlq: { 'engine.action': 25 },
      spendUsdCents: 5000,
      circuits: { 'api.shop': 'open' },
      ops: { total: 10, errors: 5 }
    }, { maxSpendUsdCents: 1000 });
    const codes = r.alerts.map((a) => a.code).sort();
    expect(codes).toEqual(['BAN_SHARE_HIGH', 'DLQ_GROWING', 'ERROR_BUDGET_BURNED', 'ONLINE_SHARE_LOW', 'SPEND_CAP_EXCEEDED', 'VENDOR_CIRCUIT_OPEN'].sort());
    expect(r.healthy).toBe(false);
    expect(r.errorBudget.remaining).toBe(0); // budget fully burned
  });

  it('flags a saturated device (capacity signal)', () => {
    const r = evaluateSlos({ platforms: [{ platform: 'ig', accountsOnline: 5, accountsBanned: 0, banShare: 0, devices: [{ deviceId: 'd9', saturation: 1 }] }] });
    expect(r.alerts.map((a) => a.code)).toContain('DEVICE_SATURATED');
  });

  it('objectives are configurable (no hardcode) and reported back', () => {
    const r = evaluateSlos({ platforms: [] }, { maxDlqDepth: 1 });
    expect(r.objectives.maxDlqDepth).toBe(1);
  });
});
