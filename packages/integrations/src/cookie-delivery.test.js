import { parseCookieDelivery } from './cookie-delivery.js';

// Shape verified by fact against a real LinkedIn "with cookies" delivery (synthetic
// values here): login | extra | user-agent | [cookie-editor json].
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36';
const cookiesJson = JSON.stringify([
  { domain: '.linkedin.com', name: 'li_at', value: 'AAAA', path: '/', secure: true, httpOnly: true, expirationDate: 1800000000.5, sameSite: 'no_restriction' },
  { domain: '.www.linkedin.com', name: 'JSESSIONID', value: 'ajax:1', path: '/', secure: true, httpOnly: false, session: true, sameSite: 'lax' }
]);

test('parses login + user-agent + cookies (normalized to puppeteer shape)', () => {
  const { login, userAgent, cookies } = parseCookieDelivery(`user@x.com|Z1|extra|${UA}|${cookiesJson}`);
  expect(login).toBe('user@x.com');
  expect(userAgent).toBe(UA);
  expect(cookies).toHaveLength(2);
  const liat = cookies.find((c) => c.name === 'li_at');
  expect(liat).toMatchObject({ name: 'li_at', value: 'AAAA', domain: '.linkedin.com', path: '/', secure: true, httpOnly: true, sameSite: 'None' });
  expect(liat.expires).toBe(1800000000); // expirationDate floored -> expires
});

test('a session cookie has no expires; JSESSIONID mapped', () => {
  const { cookies } = parseCookieDelivery(`u|${UA}|${cookiesJson}`);
  const js = cookies.find((c) => c.name === 'JSESSIONID');
  expect(js).toMatchObject({ name: 'JSESSIONID', value: 'ajax:1', secure: true, sameSite: 'Lax' });
  expect(js.expires).toBeUndefined();
});

test('malformed / empty -> empty cookies, never throws', () => {
  expect(parseCookieDelivery('').cookies).toEqual([]);
  expect(parseCookieDelivery('login|no-json-here').cookies).toEqual([]);
  expect(parseCookieDelivery(null).cookies).toEqual([]);
});
