// Splits a proxy URL into a Chromium `--proxy-server` value (scheme://host:port,
// no credentials) plus optional { username, password } auth applied separately
// (Chromium's proxy-server flag does not carry credentials). Pure — shared by
// every browser engine adapter so the parsing lives in exactly one place.
export function parseProxyUrl(proxy) {
  if (!proxy) return { server: null, auth: null };
  // A scheme-less host:port is a raw server (new URL() would mis-read the host
  // as a scheme), so only parse when an explicit scheme is present.
  if (!String(proxy).includes('://')) return { server: String(proxy), auth: null };
  try {
    const u = new URL(proxy);
    const auth = u.username
      ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password || '') }
      : null;
    return { server: `${u.protocol}//${u.host}`, auth };
  } catch {
    return { server: String(proxy), auth: null };
  }
}
