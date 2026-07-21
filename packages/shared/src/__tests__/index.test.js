import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isRtlLocale, isSupportedLocale, normalizeLocale } from '../index.js';

test('exports locales', () => {
  expect(DEFAULT_LOCALE).toBe('en');
  expect(Array.isArray(SUPPORTED_LOCALES)).toBe(true);
});

test('normalizeLocale handles region variants', () => {
  expect(normalizeLocale('es-ES')).toBe('es');
  expect(normalizeLocale('en_US')).toBe('en');
});

test('isSupportedLocale and isRtlLocale', () => {
  expect(isSupportedLocale('de')).toBe(true);
  expect(isSupportedLocale('zz')).toBe(false);
  expect(isRtlLocale('he')).toBe(true);
});







