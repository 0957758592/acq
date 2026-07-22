import { domainError } from '@acq/engine-domain';

// VerificationResourceProvider (TZ §6.7/§7). Dispatches to injected SMS/email
// vendor adapters (sms-activate, 5sim, mail.tm, IMAP…). Without a configured
// vendor every call fails safe with a coded error — never a silent stub.
function requireVendor(vendor, name) {
  if (!vendor || typeof vendor[name] !== 'function') {
    throw domainError('VERIFICATION_NUMBER_UNAVAILABLE', `no verification vendor for ${name}`);
  }
  return vendor;
}

export function createVerificationResourceProvider({ sms = null, email = null } = {}) {
  return {
    async rentNumber(input) {
      return requireVendor(sms, 'rentNumber').rentNumber(input);
    },
    async pollSms(numberId) {
      return requireVendor(sms, 'pollSms').pollSms(numberId);
    },
    async releaseNumber(numberId) {
      return requireVendor(sms, 'releaseNumber').releaseNumber(numberId);
    },
    async provisionEmail() {
      return requireVendor(email, 'provisionEmail').provisionEmail();
    },
    async pollEmailCode(address) {
      return requireVendor(email, 'pollEmailCode').pollEmailCode(address);
    }
  };
}
