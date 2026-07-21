import { validationTranslations } from './i18n.js';

function getByPath(obj, path) {
  if (!obj) return undefined;
  const parts = String(path || '').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur == null) return undefined;
  }
  return cur;
}

function interpolate(template, vars) {
  if (typeof template !== 'string') return template;
  if (!vars) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    vars[k] == null ? '' : String(vars[k])
  );
}

/**
 * Create a minimal i18n-like translator for validation keys.
 * Supports `t(key, vars)` like i18next.
 */
export function createValidationT(locale = 'en') {
  const dict = validationTranslations[locale] || validationTranslations.en;
  return (key, vars) => {
    const value = getByPath(dict, key);
    if (typeof value === 'string') return interpolate(value, vars);
    return String(key);
  };
}






