import { proxyError } from '../errors.js';

// Geo-consistency of the digital fingerprint (TZ §5.9/§5.10): the IP country
// must match the SIM, GPS and timezone country so the account presents one
// coherent identity. Facets arrive already normalized to ISO country codes
// (the SmartIP/adapter layer maps IP/SIM/GPS/timezone -> country); this domain
// rule only compares them. Absent facets are ignored, but at least one facet
// must be present — an empty set cannot prove consistency (fail-safe false).
const FACETS = ['ipCountry', 'simCountry', 'gpsCountry', 'timezoneCountry'];

function norm(value) {
  return String(value).trim().toUpperCase();
}

export function isGeoConsistent(facets = {}) {
  const present = FACETS.map((key) => facets[key]).filter((v) => v !== undefined && v !== null && v !== '');
  if (present.length === 0) return false;
  const first = norm(present[0]);
  return present.every((value) => norm(value) === first);
}

export function assertGeoConsistent(facets) {
  if (!isGeoConsistent(facets)) {
    throw proxyError('PROXY_GEO_MISMATCH', 'proxy geo facets (IP/SIM/GPS/timezone) are not consistent');
  }
}
