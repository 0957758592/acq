import { createMetricsRegistry } from './metrics.js';
import { createDomainMetrics } from './domain-metrics.js';

// A projectSnapshot-shaped input (the SAME read-model the reconciler builds, so
// metrics can never drift from what the engine actually plans on).
const snapshot = {
  platform: 'telegram',
  pool: { available: 6 },
  devices: [
    { deviceId: 'd1', activeAccountCount: 2, maxAccounts: 5, queueDepth: 1, targetDepth: 3, onlineAccountIds: ['a1', 'a2'], bannedActiveAccountIds: ['a3'] },
    { deviceId: 'd2', activeAccountCount: 1, maxAccounts: 1, queueDepth: 0, targetDepth: 3, onlineAccountIds: ['a4'], bannedActiveAccountIds: [] }
  ],
  campaigns: [{ id: 'c1' }]
};

describe('createDomainMetrics (TZ §15 domain metrics)', () => {
  it('records pool depth, device occupancy/saturation, queue depth and ban share from a snapshot', () => {
    const registry = createMetricsRegistry();
    createDomainMetrics(registry).recordSnapshot(snapshot);
    const text = registry.render();
    expect(text).toMatch(/acq_pool_available\{platform="telegram"\} 6/);
    expect(text).toMatch(/acq_device_occupancy\{deviceId="d1",platform="telegram"\} 2/);
    // saturation = active/max — the §15 "saturation" signal
    expect(text).toMatch(/acq_device_saturation\{deviceId="d1",platform="telegram"\} 0\.4/);
    expect(text).toMatch(/acq_queue_depth\{deviceId="d1",platform="telegram"\} 1/);
    expect(text).toMatch(/acq_accounts_online\{platform="telegram"\} 3/);
    expect(text).toMatch(/acq_accounts_banned\{platform="telegram"\} 1/);
    // ban share = banned / (online+banned) = 1/4
    expect(text).toMatch(/acq_ban_share\{platform="telegram"\} 0\.25/);
    expect(text).toMatch(/acq_campaigns_active\{platform="telegram"\} 1/);
  });

  it('counts purchase spend per shop (cost signal) and scrape captchas per tier', () => {
    const registry = createMetricsRegistry();
    const m = createDomainMetrics(registry);
    m.recordPurchase({ platform: 'telegram', shopId: 'darkshop', amountUsdCents: 250, count: 5 });
    m.recordPurchase({ platform: 'telegram', shopId: 'darkshop', amountUsdCents: 100, count: 2 });
    m.recordCaptcha({ platform: 'instagram', tier: 'browser' });
    const text = registry.render();
    expect(text).toMatch(/acq_purchase_spend_usd_cents_total\{platform="telegram",shopId="darkshop"\} 350/);
    expect(text).toMatch(/acq_accounts_purchased_total\{platform="telegram",shopId="darkshop"\} 7/);
    expect(text).toMatch(/acq_scrape_captcha_total\{platform="instagram",tier="browser"\} 1/);
  });

  it('records DLQ depth (the §15 alert signal for stuck work)', () => {
    const registry = createMetricsRegistry();
    createDomainMetrics(registry).recordDlq({ queue: 'engine.action', depth: 3 });
    expect(registry.render()).toMatch(/acq_dlq_depth\{queue="engine.action"\} 3/);
  });

  it('is a no-op-safe facade when partial data arrives (never throws in a hot path)', () => {
    const registry = createMetricsRegistry();
    const m = createDomainMetrics(registry);
    expect(() => m.recordSnapshot({ platform: 'x' })).not.toThrow();
    expect(() => m.recordPurchase({ platform: 'x' })).not.toThrow();
  });
});
