// Hybrid scrape tiers (TZ §10.1). Browser is the primary/default tier; the
// others are chosen when they clearly fit.
export const SCRAPE_TIERS = ['browser', 'http', 'device', 'api', 'mtproto'];

// Deterministic tier selection. Rules, in priority order:
//  - appOnly (data only visible inside the mobile app) -> on-device (T2)
//  - a stable API that does not require a login          -> api (T3)
//  - simple public, small volume, no login              -> anon-http (T1)
//  - everything else (login-gated, large, complex)      -> browser (T-B, primary)
export function selectTier({ appOnly = false, hasApi = false, needsLogin = false, volume } = {}) {
  if (appOnly) return 'device';
  if (hasApi && !needsLogin) return 'api';
  // anon-http only when we are confident the data is simple public + small;
  // an unspecified volume falls through to the browser default.
  if (!needsLogin && volume === 'small') return 'http';
  return 'browser';
}
