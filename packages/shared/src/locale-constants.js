export const DEFAULT_LOCALE = 'en';

export const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'it', 'pt', 'he'];

export function isSupportedLocale(locale) {
  return SUPPORTED_LOCALES.includes(String(locale || '').toLowerCase());
}

export function normalizeLocale(locale, fallback = DEFAULT_LOCALE) {
  const raw = String(locale || '').trim().toLowerCase();
  if (!raw) return fallback;

  // Support values like "es-ES", "en_US"
  const primary = raw.split(/[-_]/)[0];
  return isSupportedLocale(primary) ? primary : fallback;
}

export function isRtlLocale(locale) {
  // Keep minimal: only locales in SUPPORTED_LOCALES that are RTL.
  return normalizeLocale(locale) === 'he';
}
