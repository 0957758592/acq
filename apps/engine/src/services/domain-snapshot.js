import { projectSnapshot } from '../snapshot.js';

// Domain observability read-model (TZ §15) shared by the `metrics.domain` facade
// operation and the acq://metrics RAG resource — ONE computation, many surfaces.
// Derived from the same projectSnapshot the reconciler plans on.
export async function domainSnapshot(ctx, { platform } = {}) {
  const platforms = platform ? [platform] : (ctx.activePlatforms ?? []);
  const out = [];
  for (const p of platforms) {
    const s = await projectSnapshot(ctx, { platform: p });
    let online = 0;
    let banned = 0;
    const devices = (s.devices ?? []).map((d) => {
      online += (d.onlineAccountIds ?? []).length;
      banned += (d.bannedActiveAccountIds ?? []).length;
      const active = d.activeAccountCount ?? (d.onlineAccountIds ?? []).length;
      const max = d.maxAccounts ?? 0;
      return { deviceId: d.deviceId, occupancy: active, capacity: max, saturation: max > 0 ? active / max : 0, queueDepth: d.queueDepth ?? 0 };
    });
    const assigned = online + banned;
    out.push({
      platform: p,
      poolAvailable: s.pool?.available ?? 0,
      accountsOnline: online,
      accountsBanned: banned,
      banShare: assigned > 0 ? banned / assigned : 0,
      campaignsActive: (s.campaigns ?? []).length,
      devices
    });
  }
  return out;
}
