// Parser for cookie-based account deliveries (e.g. LinkedIn "with cookies" — the
// BROWSER-login format). Verified by fact against a real dark.shopping delivery:
//   login | <extra…> | <user-agent> | [ {cookie-editor objects} ]
// (pipe-separated; the user-agent field contains "Mozilla/", the cookies field is
// a JSON array in Cookie-Editor/EditThisCookie shape). Returns {login, userAgent,
// cookies} where cookies are normalized to the Puppeteer setCookie shape so a
// browser session can be restored — no on-device typing, bypassing app anti-automation.
function toPuppeteerCookie(c = {}) {
  const sameSiteMap = { no_restriction: 'None', lax: 'Lax', strict: 'Strict', unspecified: undefined };
  const ss = c.sameSite ? sameSiteMap[String(c.sameSite).toLowerCase()] ?? undefined : undefined;
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    secure: Boolean(c.secure),
    httpOnly: Boolean(c.httpOnly),
    ...(c.session ? {} : (c.expirationDate ? { expires: Math.floor(Number(c.expirationDate)) } : {})),
    ...(ss ? { sameSite: ss } : {})
  };
}

export function parseCookieDelivery(raw) {
  const text = String(raw ?? '').trim();
  // The cookie JSON is the trailing [ … ] — take it from the FIRST '[' to the LAST
  // ']' so a '|' inside a cookie value doesn't split it. The prefix (login|…|UA) is
  // parsed separately.
  const jsonStart = text.indexOf('[');
  const jsonEnd = text.lastIndexOf(']');
  let cookies = [];
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const arr = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      if (Array.isArray(arr)) cookies = arr.filter((c) => c && c.name).map(toPuppeteerCookie);
    } catch {
      cookies = [];
    }
  }
  const prefix = jsonStart >= 0 ? text.slice(0, jsonStart) : text;
  const parts = prefix.split('|');
  const userAgent = (parts.find((p) => /Mozilla\//.test(p)) ?? '').trim() || null;
  return { login: (parts[0] ?? '').trim() || null, userAgent, cookies };
}
