// Domain metrics (TZ §15) — the business-level signals Prometheus scrapes
// alongside the generic facade counters: pool depth, device occupancy AND
// saturation, per-device queue depth, online/banned counts + ban share,
// purchase spend, scrape captchas, DLQ depth.
//
// Fed from the SAME projectSnapshot read-model the reconciler plans on, so the
// metrics can never drift from what the engine actually sees. Every recorder is
// defensive (partial data must never throw in a hot path).
export function createDomainMetrics(registry) {
  const poolAvailable = registry.gauge('acq_pool_available', 'Available accounts in the pool per platform');
  const deviceOccupancy = registry.gauge('acq_device_occupancy', 'Active accounts hosted per device');
  const deviceSaturation = registry.gauge('acq_device_saturation', 'Device capacity saturation (active/max, 0..1)');
  const queueDepth = registry.gauge('acq_queue_depth', 'Per-device account queue depth');
  const accountsOnline = registry.gauge('acq_accounts_online', 'Online accounts per platform');
  const accountsBanned = registry.gauge('acq_accounts_banned', 'Banned accounts still assigned per platform');
  const banShare = registry.gauge('acq_ban_share', 'Banned share of assigned accounts (0..1)');
  const campaignsActive = registry.gauge('acq_campaigns_active', 'Active campaigns per platform');
  const purchaseSpend = registry.counter('acq_purchase_spend_usd_cents_total', 'Cumulative purchase spend per shop (USD cents)');
  const accountsPurchased = registry.counter('acq_accounts_purchased_total', 'Accounts purchased per shop');
  const scrapeCaptcha = registry.counter('acq_scrape_captcha_total', 'Scrape captcha walls hit per tier');
  const dlqDepth = registry.gauge('acq_dlq_depth', 'Dead-letter queue depth');

  return {
    // From projectSnapshot(ctx, {platform}) output.
    recordSnapshot(snapshot = {}) {
      const platform = snapshot.platform ?? 'unknown';
      const labels = { platform };
      poolAvailable.set(labels, snapshot.pool?.available ?? 0);
      campaignsActive.set(labels, (snapshot.campaigns ?? []).length);

      let online = 0;
      let banned = 0;
      for (const d of snapshot.devices ?? []) {
        const deviceLabels = { platform, deviceId: d.deviceId ?? 'unknown' };
        const active = d.activeAccountCount ?? (d.onlineAccountIds ?? []).length;
        const max = d.maxAccounts ?? 0;
        deviceOccupancy.set(deviceLabels, active);
        deviceSaturation.set(deviceLabels, max > 0 ? active / max : 0);
        queueDepth.set(deviceLabels, d.queueDepth ?? 0);
        online += (d.onlineAccountIds ?? []).length;
        banned += (d.bannedActiveAccountIds ?? []).length;
      }
      accountsOnline.set(labels, online);
      accountsBanned.set(labels, banned);
      const assigned = online + banned;
      banShare.set(labels, assigned > 0 ? banned / assigned : 0);
    },

    recordPurchase({ platform = 'unknown', shopId = 'unknown', amountUsdCents = 0, count = 0 } = {}) {
      const labels = { platform, shopId };
      purchaseSpend.inc(labels, amountUsdCents ?? 0);
      accountsPurchased.inc(labels, count ?? 0);
    },

    recordCaptcha({ platform = 'unknown', tier = 'unknown' } = {}) {
      scrapeCaptcha.inc({ platform, tier });
    },

    recordDlq({ queue = 'unknown', depth = 0 } = {}) {
      dlqDepth.set({ queue }, depth);
    }
  };
}
