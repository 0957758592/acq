import { domainError } from '@acq/engine-domain';

import { extractPath } from './response-map.js';

// Extracts delivered accounts from a shop's raw delivery blob per a
// DeliveryFormatSpec (TZ §6.2). Returns { identifier, secrets } candidates —
// RAW secrets that the caller must move into vault to become secretRefs
// (§6.6/§14.4). Never guesses: an unverified or unknown format is a fail-safe
// coded error (PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED).
function unverified(message) {
  return domainError('PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED', message);
}

// Assigns value at a possibly-nested key ('secrets.session') onto target.
function assignPath(target, dottedKey, value) {
  const parts = dottedKey.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node[parts[i]] = node[parts[i]] || {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

// Flattens an itemMap into [dottedOutKey, path] pairs, accepting BOTH the dotted
// form ({ 'secrets.session': 'sess' }) and an equivalent nested-object form
// ({ secrets: { session: 'sess' } }). The nested form carries no dotted keys, so
// a spec written that way survives the facade's Mongo-injection guard and can be
// registered through any control surface (not only the engine-internal path).
function flattenItemMap(itemMap, prefix = '') {
  const out = [];
  for (const [key, val] of Object.entries(itemMap || {})) {
    const outKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) out.push(...flattenItemMap(val, outKey));
    else out.push([outKey, val]);
  }
  return out;
}

function fromJsonArray(blob, spec) {
  const items = Array.isArray(blob) ? blob : [];
  const entries = flattenItemMap(spec.itemMap);
  return items.map((item) => {
    const acc = { identifier: undefined, secrets: {} };
    for (const [outKey, path] of entries) {
      assignPath(acc, outKey, extractPath(item, path));
    }
    return acc;
  });
}

function fromLines(blob, spec) {
  const separator = spec.separator || ':';
  return String(blob)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const parts = line.split(separator);
      const secrets = {};
      for (const [name, index] of Object.entries(spec.secrets || {})) {
        secrets[name] = parts[index];
      }
      return { identifier: parts[spec.identifierIndex ?? 0], secrets };
    });
}

export function extractDelivered(blob, spec = {}) {
  if (!spec.verified) {
    throw unverified(`delivery format for shop is not verified (format=${spec.format})`);
  }
  if (spec.format === 'json-array') return fromJsonArray(blob, spec);
  if (spec.format === 'lines') return fromLines(blob, spec);
  throw unverified(`unknown delivery format '${spec.format}'`);
}
