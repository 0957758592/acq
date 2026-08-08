import { parseDriveFolder, driveDownloadUrl, parseTelegramSessionJson } from './telegram-delivery.js';

// A public Drive folder page embeds its file list in window['_DRIVE_ivd'] as a
// hex-escaped JSON array: [[ [fileId,[parent],name,mime,...], ... ], ...].
const DRIVE_HTML = `<html><head></head><body><script>window['_DRIVE_ivd'] = '\\x5b\\x5b\\x5b\\x22FID_JSON\\x22,\\x5b\\x22PARENT\\x22\\x5d,\\x22+14504891347.json\\x22,\\x22application\\/json\\x22\\x5d,\\x5b\\x22FID_SESS\\x22,\\x5b\\x22PARENT\\x22\\x5d,\\x22+14504891347.session\\x22,\\x22application\\/octet-stream\\x22\\x5d,\\x5b\\x22FID_TD\\x22,\\x5b\\x22PARENT\\x22\\x5d,\\x22tdata\\x22,\\x22application\\/vnd.google-apps.folder\\x22\\x5d\\x5d\\x5d';</script></body></html>`;

test('parseDriveFolder lists {id,name,mimeType} for every entry', () => {
  const files = parseDriveFolder(DRIVE_HTML);
  expect(files).toEqual([
    { id: 'FID_JSON', name: '+14504891347.json', mimeType: 'application/json' },
    { id: 'FID_SESS', name: '+14504891347.session', mimeType: 'application/octet-stream' },
    { id: 'FID_TD', name: 'tdata', mimeType: 'application/vnd.google-apps.folder' }
  ]);
});

test('parseDriveFolder on a login/JS wall (no _DRIVE_ivd) -> coded seam', () => {
  expect(() => parseDriveFolder('<html>Sign in</html>')).toThrow(/DRIVE_FOLDER_UNREADABLE/);
});

test('driveDownloadUrl builds the public direct-download URL for a file id', () => {
  expect(driveDownloadUrl('FID_JSON')).toBe('https://drive.google.com/uc?export=download&id=FID_JSON');
});

const SESSION_JSON = JSON.stringify({
  phone: '+14504891347', user_id: '8487949275', api_id: 2040,
  api_hash: 'b18441a1ff607e10a989891a5462e627', password: 'Ra821',
  alpha_2: 'CA', session_string: '1AZWarzU_SESSION_STRING',
  first_name: 'Alena', last_name: 'Leon'
});

test('parseTelegramSessionJson extracts the session + api creds + phone/country/2fa', () => {
  expect(parseTelegramSessionJson(SESSION_JSON)).toEqual({
    sessionString: '1AZWarzU_SESSION_STRING',
    apiId: 2040,
    apiHash: 'b18441a1ff607e10a989891a5462e627',
    phone: '+14504891347',
    userId: '8487949275',
    password: 'Ra821',
    country: 'CA'
  });
});

test('parseTelegramSessionJson without a session_string -> coded seam (unusable via MTProto)', () => {
  expect(() => parseTelegramSessionJson(JSON.stringify({ phone: '+1', api_id: 2040 })))
    .toThrow(/NO_SESSION_STRING/);
  expect(() => parseTelegramSessionJson('not json')).toThrow(/TELEGRAM_JSON_INVALID/);
});
