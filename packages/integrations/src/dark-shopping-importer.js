// dark.shopping delivery importer — DELIVERY-FORMAT SEAM.
//
// The real dark.shopping delivery payload (session artifact for a purchased
// WhatsApp account) is NOT known from code and MUST be verified by fact.
// `mapDeliveredAccount` is the ONE place to adapt once a live payload is captured.
// Until then, `importDelivered` refuses unverified input so no guessed mapping ships.
// TO GO LIVE: (1) capture a real delivery payload, (2) implement mapDeliveredAccount
// against it, (3) add a real fixture test, (4) flip the caller to pass verifiedFormat:true.
import { normalizeMsisdn, domainError } from '@acq/whatsapp';

export function mapDeliveredAccount(item) {
  // PROVISIONAL contract shape — replace field names with the REAL payload's once observed.
  const msisdn = normalizeMsisdn(item.phone ?? item.msisdn ?? item.number);
  const secretRefs = {};
  if (item.session) secretRefs.session = item.session; // session artifact ref, never inline secrets
  return { msisdn, source: 'dark_shopping', secretRefs };
}

export function importDelivered(raw, { verifiedFormat = false } = {}) {
  if (!verifiedFormat) {
    throw domainError(
      'PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED',
      'dark.shopping delivery format not verified — implement mapDeliveredAccount against a real payload first'
    );
  }
  const items = Array.isArray(raw?.accounts) ? raw.accounts : (Array.isArray(raw) ? raw : []);
  return items.map(mapDeliveredAccount);
}
