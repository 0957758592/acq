// JSONPath-lite extraction for declarative ShopAdapterSpec responseMaps
// (TZ §6.2). Supports dot paths, [index] array access and an optional leading
// `$`/`$.` root. Missing paths yield undefined (never throw) so callers can
// apply their own fail-safe guards.
export function extractPath(obj, path) {
  const normalized = String(path).replace(/^\$\.?/, '');
  if (normalized === '') return obj;
  const segments = normalized
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((s) => s !== '');
  let current = obj;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

// Projects a raw vendor response into a flat output object using a
// { outputField: 'json.path' } map. Fields whose path is absent are omitted.
export function applyResponseMap(raw, responseMap = {}) {
  const out = {};
  for (const [field, path] of Object.entries(responseMap)) {
    const value = extractPath(raw, path);
    if (value !== undefined) out[field] = value;
  }
  return out;
}
