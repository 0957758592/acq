import { buildTelegramDeliveredAccounts } from './telegram-deliver.js';

const DRIVE_HTML = `<script>window['_DRIVE_ivd'] = '\\x5b\\x5b\\x5b\\x22FID_JSON\\x22,\\x5b\\x22P\\x22\\x5d,\\x22+14504891347.json\\x22,\\x22application\\/json\\x22\\x5d,\\x5b\\x22FID_TD\\x22,\\x5b\\x22P\\x22\\x5d,\\x22tdata\\x22,\\x22application\\/vnd.google-apps.folder\\x22\\x5d\\x5d\\x5d';</script>`;
const SESSION_JSON = JSON.stringify({
  phone: '+14504891347', user_id: '8487949275', api_id: 2040,
  api_hash: 'b18441a1ff607e10a989891a5462e627', password: 'Ra821',
  alpha_2: 'CA', session_string: '1AZ_SESSION'
});
const RAW = 'https://drive.google.com/drive/folders/FOLDERXYZ?usp=sharing,';

function ctxWith() {
  return { credentialVault: { put: async (v) => `vault:${v}` }, defaultShopId: 'dark.shopping' };
}
const fetchText = async (url) => {
  if (url.includes('/drive/folders/FOLDERXYZ')) return DRIVE_HTML;
  if (url.includes('id=FID_JSON')) return SESSION_JSON;
  throw new Error(`unexpected fetch ${url}`);
};

test('downloads the Drive folder, extracts the session .json, vaults secrets, returns a pool account', async () => {
  const { accounts, shopId } = await buildTelegramDeliveredAccounts(ctxWith(), { orderId: '7961005', platform: 'telegram', raw: RAW, fetchText });
  expect(shopId).toBe('dark.shopping');
  expect(accounts).toHaveLength(1);
  const a = accounts[0];
  expect(a).toMatchObject({
    platform: 'telegram', identifier: '+14504891347', source: 'purchase', shopId: 'dark.shopping',
    profile: { phone: '+14504891347', userId: '8487949275', apiId: 2040, country: 'CA', mtproto: true, delivery: 'drive-tdata' }
  });
  // secrets vaulted (never raw); session ref mirrored into session.secretRef for the driver
  expect(a.secretRefs.session).toBe('vault:1AZ_SESSION');
  expect(a.secretRefs.apiHash).toBe('vault:b18441a1ff607e10a989891a5462e627');
  expect(a.secretRefs.password).toBe('vault:Ra821');
  expect(a.session.secretRef).toBe('vault:1AZ_SESSION');
});

test('a delivery without a Drive folder url -> retryable coded seam', async () => {
  await expect(buildTelegramDeliveredAccounts(ctxWith(), { orderId: '1', raw: 'pending...', fetchText }))
    .rejects.toMatchObject({ code: 'NO_DRIVE_FOLDER', retryable: true });
});

test('a folder with no .json file -> coded seam', async () => {
  const noJson = async () => `<script>window['_DRIVE_ivd'] = '\\x5b\\x5b\\x5b\\x22X\\x22,\\x5b\\x22P\\x22\\x5d,\\x22tdata\\x22,\\x22application\\/vnd.google-apps.folder\\x22\\x5d\\x5d\\x5d';</script>`;
  await expect(buildTelegramDeliveredAccounts(ctxWith(), { orderId: '1', raw: RAW, fetchText: noJson }))
    .rejects.toMatchObject({ code: 'NO_SESSION_JSON_FILE' });
});

test('missing vault / fetch -> coded seams (never store plaintext)', async () => {
  await expect(buildTelegramDeliveredAccounts({ defaultShopId: 'x' }, { orderId: '1', raw: RAW, fetchText }))
    .rejects.toMatchObject({ code: 'CREDENTIAL_VAULT_UNAVAILABLE' });
  await expect(buildTelegramDeliveredAccounts(ctxWith(), { orderId: '1', raw: RAW }))
    .rejects.toMatchObject({ code: 'FETCH_UNAVAILABLE' });
});
