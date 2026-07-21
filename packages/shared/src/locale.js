import { DEFAULT_LOCALE, SUPPORTED_LOCALES, normalizeLocale } from './locale-constants.js';

export const LOCALE_PATH_PATTERN = /^\/([a-zA-Z-]+)(\/|$)/;

export function isDefaultLocale(locale) {
  return normalizeLocale(locale) === DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname) {
  const match = String(pathname || '').match(LOCALE_PATH_PATTERN);
  if (!match) return { locale: null, pathname };
  const raw = String(match[1] || '').trim().toLowerCase();
  if (!raw) return { locale: null, pathname };
  const primary = raw.split(/[-_]/)[0];
  if (!SUPPORTED_LOCALES.includes(primary)) return { locale: null, pathname };
  const stripped = pathname.replace(LOCALE_PATH_PATTERN, '/');
  return { locale: primary, pathname: stripped === '/' ? '/' : stripped.replace(/\/+$/, '') };
}

export function buildLocalePath(pathname, locale, defaultLocale = DEFAULT_LOCALE) {
  const safePath = String(pathname || '');
  const normalized = normalizeLocale(locale, defaultLocale);
  if (!safePath || safePath === '/') {
    return normalized === defaultLocale ? '/' : `/${normalized}`;
  }
  const stripped = safePath.startsWith('/') ? safePath : `/${safePath}`;
  return normalized === defaultLocale ? stripped : `/${normalized}${stripped}`;
}
