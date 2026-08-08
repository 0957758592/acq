import { parseDriveFolder, driveDownloadUrl, parseTelegramSessionJson } from '@acq/integrations';

// Deliver-and-import for Telegram reseller purchases (TZ §6/§8.3). Telegram
// accounts ship as a public Google Drive FOLDER (tdata/ + .session + .json), not
// a keystore text blob — so this path fetches the folder index, downloads the
// account .json, extracts its Telethon StringSession + api creds, VAULTS the
// secrets, and returns a pool-ready account. Network I/O (`fetchText`) is
// injected so the orchestration is testable; composition passes a real fetch.
function seam(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

const DRIVE_FOLDER_RE = /https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+/;

export async function buildTelegramDeliveredAccounts(ctx, { shopId, orderId, platform = 'telegram', raw, fetchText } = {}) {
  if (orderId === undefined || orderId === null || orderId === '') throw seam('ORDER_ID_REQUIRED', 'orderId is required');
  if (!ctx.credentialVault) throw seam('CREDENTIAL_VAULT_UNAVAILABLE', 'no credential vault wired — refusing to store plaintext session');
  const fetch = fetchText ?? ctx.fetchText;
  if (typeof fetch !== 'function') throw seam('FETCH_UNAVAILABLE', 'no fetchText wired to download the Drive delivery');

  const folderUrl = DRIVE_FOLDER_RE.exec(String(raw ?? ''))?.[0];
  if (!folderUrl) throw Object.assign(seam('NO_DRIVE_FOLDER', `order ${orderId} delivery has no Drive folder url yet`), { retryable: true });

  const files = parseDriveFolder(await fetch(folderUrl));
  const jsonFile = files.find((f) => /\.json$/i.test(f.name));
  if (!jsonFile) throw seam('NO_SESSION_JSON_FILE', `Drive folder for order ${orderId} has no .json (files: ${files.map((f) => f.name).join(', ')})`);

  const s = parseTelegramSessionJson(await fetch(driveDownloadUrl(jsonFile.id)));
  const resolvedShopId = shopId ?? ctx.defaultShopId ?? 'dark.shopping';
  const vault = (v) => (v == null ? undefined : ctx.credentialVault.put(v));

  const sessionRef = await vault(s.sessionString);
  const account = {
    platform,
    identifier: s.phone ?? s.userId ?? `tg:${orderId}`,
    source: 'purchase',
    shopId: resolvedShopId,
    secretRefs: {
      session: sessionRef,
      apiHash: await vault(s.apiHash),
      password: await vault(s.password)
    },
    // session-import driver reads session.secretRef; MTProto reads profile.apiId.
    session: { secretRef: sessionRef },
    profile: { phone: s.phone, userId: s.userId, apiId: s.apiId, country: s.country, delivery: 'drive-tdata', mtproto: true }
  };
  return { accounts: [account], shopId: resolvedShopId };
}
