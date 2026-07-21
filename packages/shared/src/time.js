import { DateTime } from 'luxon';

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Manila',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Brisbane',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland'
];

export function getAllTimezones() {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('timeZone');
  }
  return FALLBACK_TIMEZONES;
}

export function isValidTimezone(zone) {
  const raw = String(zone || '').trim();
  if (!raw) return false;
  if (raw === 'UTC') return true;
  return DateTime.now().setZone(raw).isValid;
}

export function resolveTimezone(zone, fallback = 'UTC') {
  const raw = String(zone || '').trim();
  if (!raw) return fallback;
  return isValidTimezone(raw) ? raw : fallback;
}

export function getAllTimezoneOptions({ includeOffsets = true } = {}) {
  const timezones = getAllTimezones();
  if (!includeOffsets) return timezones.map((timezone) => ({ value: timezone, label: timezone }));
  const now = DateTime.now();
  return timezones
    .map((timezone) => {
      const dateTime = now.setZone(timezone);
      if (!dateTime.isValid) return null;
      const offset = dateTime.toFormat('ZZ');
      return {
        value: timezone,
        label: `${timezone} (UTC${offset})`
      };
    })
    .filter(Boolean);
}

function resolveZone(zone) {
  return resolveTimezone(zone);
}

export function coerceDateTime(value, { zone = 'UTC', locale } = {}) {
  const resolvedZone = resolveZone(zone);
  let dateTime = null;

  if (!value) return null;
  if (DateTime.isDateTime(value)) {
    dateTime = value.setZone(resolvedZone);
  } else if (value instanceof Date) {
    dateTime = DateTime.fromJSDate(value, { zone: resolvedZone });
  } else if (typeof value === 'number') {
    dateTime = DateTime.fromMillis(value, { zone: resolvedZone });
  } else if (typeof value === 'string') {
    dateTime = DateTime.fromISO(value, { zone: resolvedZone });
  }

  if (!dateTime || !dateTime.isValid) return null;
  if (locale) return dateTime.setLocale(locale);
  return dateTime;
}

export function nowInZone({ zone = 'UTC', locale } = {}) {
  const resolvedZone = resolveZone(zone);
  const dateTime = DateTime.now().setZone(resolvedZone);
  if (locale) return dateTime.setLocale(locale);
  return dateTime;
}

export function nowInZoneDate(options = {}) {
  return nowInZone(options).toJSDate();
}

export function startOfDay(value, options) {
  const dateTime = coerceDateTime(value, options);
  if (!dateTime) return null;
  return dateTime.startOf('day');
}

export function resolveDateOnlyKey(value, options) {
  const dateTime = startOfDay(value, options);
  if (!dateTime) return '';
  return dateTime.toFormat('yyyy-LL-dd');
}

export function toJsDate(value, options) {
  const dateTime = coerceDateTime(value, options);
  return dateTime ? dateTime.toJSDate() : null;
}

export function buildDateTime({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  zone = 'UTC',
  locale
}) {
  const resolvedZone = resolveZone(zone);
  const dateTime = DateTime.fromObject(
    { year, month, day, hour, minute, second, millisecond },
    { zone: resolvedZone }
  );
  if (!dateTime.isValid) return null;
  if (locale) return dateTime.setLocale(locale);
  return dateTime;
}

export function formatDate(value, { zone = 'UTC', locale, format = 'DDD' } = {}) {
  const dateTime = coerceDateTime(value, { zone, locale });
  if (!dateTime) return '';
  return dateTime.toFormat(format);
}

export function formatTime(value, { zone = 'UTC', locale, format = 't' } = {}) {
  const dateTime = coerceDateTime(value, { zone, locale });
  if (!dateTime) return '';
  return dateTime.toFormat(format);
}

export function formatDateTime(value, { zone = 'UTC', locale, format = 'DDD t' } = {}) {
  const dateTime = coerceDateTime(value, { zone, locale });
  if (!dateTime) return '';
  return dateTime.toFormat(format);
}

export function formatDateRange({ startDate, endDate, zone = 'UTC', locale, format = 'DDD' }) {
  const start = coerceDateTime(startDate, { zone, locale });
  const end = coerceDateTime(endDate, { zone, locale });
  if (!start || !end) return '';
  if (start.hasSame(end, 'day')) return start.toFormat(format);
  return `${start.toFormat(format)} – ${end.toFormat(format)}`;
}

