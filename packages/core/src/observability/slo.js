// SLO evaluation + error-budget tracking (TZ §15 alerting). Pure: takes the
// domain snapshot + facade error stats and returns the ALERTS that are firing.
// Objectives are configuration (no hardcode) — the §15 defaults cover the four
// named signals: DLQ growth, online-share drop, spend cap, vendor circuit open.
export const DEFAULT_OBJECTIVES = {
  minOnlineShare: 0.5,      // online / (online + banned) per platform
  maxBanShare: 0.3,
  maxDlqDepth: 10,
  maxSpendUsdCents: null,   // null = no cap configured
  maxErrorRate: 0.2,        // facade errors / total ops (error budget)
  maxDeviceSaturation: 0.95
};

function alert(severity, code, message, context = {}) {
  return { severity, code, message, context };
}

export function evaluateSlos({ platforms = [], dlq = {}, spendUsdCents = 0, ops = { total: 0, errors: 0 }, circuits = {} } = {}, objectives = {}) {
  const o = { ...DEFAULT_OBJECTIVES, ...objectives };
  const alerts = [];

  for (const p of platforms) {
    const assigned = (p.accountsOnline ?? 0) + (p.accountsBanned ?? 0);
    if (assigned > 0) {
      const onlineShare = (p.accountsOnline ?? 0) / assigned;
      if (onlineShare < o.minOnlineShare) {
        alerts.push(alert('critical', 'ONLINE_SHARE_LOW', `online share ${onlineShare.toFixed(2)} below ${o.minOnlineShare}`, { platform: p.platform, onlineShare }));
      }
      if ((p.banShare ?? 0) > o.maxBanShare) {
        alerts.push(alert('warning', 'BAN_SHARE_HIGH', `ban share ${p.banShare.toFixed(2)} above ${o.maxBanShare}`, { platform: p.platform, banShare: p.banShare }));
      }
    }
    for (const d of p.devices ?? []) {
      if ((d.saturation ?? 0) > o.maxDeviceSaturation) {
        alerts.push(alert('warning', 'DEVICE_SATURATED', `device ${d.deviceId} at ${(d.saturation * 100).toFixed(0)}% capacity`, { platform: p.platform, deviceId: d.deviceId, saturation: d.saturation }));
      }
    }
  }

  for (const [queue, depth] of Object.entries(dlq)) {
    if (depth > o.maxDlqDepth) {
      alerts.push(alert('critical', 'DLQ_GROWING', `dead-letter queue ${queue} at ${depth}`, { queue, depth }));
    }
  }

  if (o.maxSpendUsdCents != null && spendUsdCents > o.maxSpendUsdCents) {
    alerts.push(alert('critical', 'SPEND_CAP_EXCEEDED', `spend ${spendUsdCents} exceeds cap ${o.maxSpendUsdCents}`, { spendUsdCents, cap: o.maxSpendUsdCents }));
  }

  // Error budget: burn = errors/total against the objective.
  const total = ops.total ?? 0;
  const errorRate = total > 0 ? (ops.errors ?? 0) / total : 0;
  const budgetRemaining = o.maxErrorRate > 0 ? Math.max(0, 1 - errorRate / o.maxErrorRate) : 0;
  if (total > 0 && errorRate > o.maxErrorRate) {
    alerts.push(alert('critical', 'ERROR_BUDGET_BURNED', `error rate ${errorRate.toFixed(2)} above ${o.maxErrorRate}`, { errorRate, total }));
  }

  for (const [host, state] of Object.entries(circuits)) {
    if (state === 'open') alerts.push(alert('critical', 'VENDOR_CIRCUIT_OPEN', `vendor ${host} circuit is open`, { host }));
  }

  return { alerts, errorBudget: { errorRate, objective: o.maxErrorRate, remaining: budgetRemaining }, objectives: o, healthy: alerts.length === 0 };
}
