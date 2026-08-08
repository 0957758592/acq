import { domainError } from '@acq/engine-domain';

// Telegram reseller delivery (dark.shopping & peers). Unlike keystore platforms
// (a login/password text blob), Telegram accounts ship as a PUBLIC Google Drive
// FOLDER containing tdata/ + a .session + a .json. The .json carries a Telethon
// StringSession (`session_string`) plus the api_id/api_hash it was minted with —
// directly usable over MTProto (verified by fact). These parsers are pure so the
// download orchestration (network) stays in the engine service and is testable.

// Parse a public Drive folder page's embedded file index. The list lives in
// window['_DRIVE_ivd'] as a hex-escaped JSON array whose first element is the
// array of file entries [fileId, [parentId], name, mimeType, ...].
export function parseDriveFolder(html) {
  const m = /_DRIVE_ivd'\]\s*=\s*'((?:\\x[0-9a-fA-F]{2}|\\.|[^'\\])*)'/.exec(String(html ?? ''));
  if (!m) throw domainError('DRIVE_FOLDER_UNREADABLE', 'no _DRIVE_ivd index on page (login/JS wall or not public)');
  // Unescape the \xHH (and \/) sequences into a real JSON string, then parse.
  const json = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, '/');
  let data;
  try { data = JSON.parse(json); } catch (err) { throw domainError('DRIVE_FOLDER_UNREADABLE', `_DRIVE_ivd not parseable: ${err.message}`); }
  const entries = Array.isArray(data?.[0]) ? data[0] : [];
  return entries
    .filter((e) => Array.isArray(e) && typeof e[0] === 'string')
    .map((e) => ({ id: e[0], name: e[2] ?? '', mimeType: e[3] ?? '' }));
}

// Public direct-download URL for a Drive file id (small files download inline).
export function driveDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// Extract the MTProto-usable fields from a delivered account .json.
export function parseTelegramSessionJson(text) {
  let j;
  try { j = JSON.parse(text); } catch (err) { throw domainError('TELEGRAM_JSON_INVALID', `account .json not parseable: ${err.message}`); }
  if (!j?.session_string) throw domainError('NO_SESSION_STRING', 'account .json has no session_string (unusable via MTProto)');
  return {
    sessionString: j.session_string,
    apiId: j.api_id != null ? Number(j.api_id) : null,
    apiHash: j.api_hash ?? null,
    phone: j.phone ?? null,
    userId: j.user_id != null ? String(j.user_id) : null,
    password: j.password || null,
    country: j.alpha_2 ?? null
  };
}
