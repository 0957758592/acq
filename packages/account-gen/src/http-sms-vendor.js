import { domainError } from '@acq/engine-domain';

// Generic HTTP SMS-verification vendor adapter (TZ §6.7) — implements the SMS
// side of VerificationResourceProvider (rentNumber / pollSms / releaseNumber)
// over ANY declarative HTTP vendor (sms-activate / 5sim / smshub / …). The
// vendor's endpoints + response mapping are INJECTED (verify-by-fact — the exact
// API shape is per vendor); the request/guard mechanism here is real. A number
// with no code yet returns null (the caller polls); an exhausted rental is a
// coded error, never a fabricated code.
export function createHttpSmsVendor({ httpClient, endpoints = {}, map = {} } = {}) {
  if (!httpClient?.request) throw new Error('createHttpSmsVendor requires an httpClient');
  const pick = (obj, path) => (path ? String(path).split('.').reduce((a, k) => (a == null ? a : a[k]), obj) : obj);

  async function call(name, body) {
    const ep = endpoints[name];
    if (!ep) throw domainError('VERIFICATION_VENDOR_UNCONFIGURED', `no ${name} endpoint configured`);
    return httpClient.request({ method: ep.method ?? 'GET', url: ep.url, auth: ep.auth, body });
  }

  return {
    async rentNumber({ country, service } = {}) {
      const res = await call('rent', { country, service });
      const numberId = pick(res, map.numberId);
      const msisdn = pick(res, map.msisdn);
      if (!numberId || !msisdn) throw domainError('VERIFICATION_NUMBER_UNAVAILABLE', 'vendor returned no number');
      return { numberId: String(numberId), msisdn: String(msisdn) };
    },

    // Returns the code once it has arrived, or null while still pending.
    async pollSms(numberId) {
      const res = await call('status', { numberId });
      const status = String(pick(res, map.status) ?? '').toLowerCase();
      if (map.exhaustedStatuses?.includes(status)) {
        throw domainError('VERIFICATION_CODE_TIMEOUT', `rental ${numberId} exhausted (${status})`);
      }
      const code = pick(res, map.code);
      return code ? String(code) : null;
    },

    async releaseNumber(numberId) {
      await call('cancel', { numberId });
      return { released: true };
    }
  };
}
