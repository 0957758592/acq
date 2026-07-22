// Content-Security-Policy for the dashboard (TZ §11.9 / REQUIREM §7.5). Strict:
// only self-hosted scripts/styles (no unsafe-inline for scripts), connect only
// to self + the control-plane API, no objects, no framing.
export function buildCsp({ apiOrigin = 'self' } = {}) {
  const connect = apiOrigin && apiOrigin !== 'self' ? `'self' ${apiOrigin}` : "'self'";
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}
