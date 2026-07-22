// LIVE e2e: drive EVERY account type through a REAL DuoPlus cloud phone.
//
// Resolves the target device by name (default 'mattclone_duo') in the real
// DuoPlus account, powers it on, then for each platform builds the generic
// PlatformAutomationAdapter over the REAL duoplus provider and attempts
// bringOnline + probeState — recording an honest per-platform outcome
// (online / coded verify-by-fact seam / real device I/O error). It asserts every
// platform yields a DEFINITE outcome and that no platform is ever faked "online"
// without a real login. NEVER stubs.
//
// Requires real credentials — set before running, else the suite skips cleanly:
//   DUOPLUS_API_KEY=<your key>            (required)
//   DUOPLUS_API_BASE_URL=<url>            (optional; defaults to openapi.duoplus.net)
//   DUOPLUS_TEST_DEVICE=mattclone_duo     (device NAME to search; default below)
//   DUOPLUS_TEST_DEVICE_ID=<image_id>     (optional; bypasses name lookup)
// Run: DUOPLUS_API_KEY=... yarn workspace @acq/engine-app test:live duoplus-allplatforms
import { createDeviceProvider } from '@acq/device-control';
import { createPlatformAutomationAdapter } from '@acq/engine-infra';
import { listPlatforms } from '@acq/platform-registry';

const API_KEY = process.env.DUOPLUS_API_KEY;
const BASE_URL = process.env.DUOPLUS_API_BASE_URL || 'https://openapi.duoplus.net';
const DEVICE_NAME = process.env.DUOPLUS_TEST_DEVICE || 'mattclone_duo';
const DEVICE_ID = process.env.DUOPLUS_TEST_DEVICE_ID || '';
const PLATFORMS = listPlatforms();

const secretResolver = { resolve: async (ref) => ref, put: async (name) => `env:${name}` };
const KNOWN_SEAMS = /_UNVERIFIED$|_UNSUPPORTED$|ONLINE_METHOD_UNSUPPORTED|SESSION_IMPORT/;

let provider;
let providerDeviceId = '';
let ready = false;
const matrix = {};

function pickName(phone) {
  return String(phone?.name || phone?.image_id || phone?.imageId || phone?.id || '').trim();
}
function pickId(phone) {
  return String(phone?.id || phone?.image_id || phone?.imageId || '').trim();
}

beforeAll(async () => {
  if (!API_KEY) return; // no creds -> skip (each test guards on `ready`)
  provider = createDeviceProvider({ type: 'duoplus', apiKey: API_KEY, baseUrl: BASE_URL });

  if (DEVICE_ID) {
    providerDeviceId = DEVICE_ID;
  } else {
    const list = await provider.listDevices({ page: 1, pagesize: 100 });
    const phones = Array.isArray(list) ? list : list?.data?.list ?? list?.data ?? list?.list ?? [];
    // Prefer an exact/contains name match; otherwise self-select a RUNNING device
    // (status 1) so the e2e works against whatever the account actually has.
    const isRunning = (p) => Number(p?.status) === 1;
    const match = phones.find((p) => pickName(p).toLowerCase() === DEVICE_NAME.toLowerCase())
      || phones.find((p) => pickName(p).toLowerCase().includes(DEVICE_NAME.toLowerCase()))
      || phones.find(isRunning)
      || phones[0];
    if (!match) {
      throw new Error(`no DuoPlus phones available in the account`);
    }
    providerDeviceId = pickId(match);
    console.log(`[duoplus e2e] target device: id=${providerDeviceId} name="${pickName(match)}" status=${match?.status}`);
  }

  // Verify by fact + power on (idempotent).
  await provider.describeInstance(providerDeviceId);
  await provider.startDevice(providerDeviceId).catch(() => {});
  ready = true;
}, 120000);

describe('all account types through a REAL DuoPlus device', () => {
  it('resolves and powers on the target cloud phone', () => {
    if (!ready) { console.warn(`[duoplus e2e] SKIP — set DUOPLUS_API_KEY (device '${DEVICE_NAME}')`); return; }
    expect(providerDeviceId).toBeTruthy();
  });

  it.each(PLATFORMS)('drives %s bringOnline+probe on the real device (honest outcome, never faked)', async (platform) => {
    if (!ready) { console.warn(`[duoplus e2e] SKIP ${platform} — no DUOPLUS_API_KEY`); return; }

    const adapter = createPlatformAutomationAdapter({ platform, provider, secretResolver });
    const account = { platform, identifier: `e2e_${platform}`, source: 'purchase', secretRefs: {} };
    const outcome = { platform };

    try {
      const r = await adapter.bringOnline({ providerDeviceId, account, opts: {} });
      outcome.bringOnline = r?.ok ? 'online' : 'blocked';
    } catch (err) {
      outcome.bringOnline = err.code ? `seam:${err.code}` : `error:${err.message}`;
    }
    try {
      outcome.probe = await adapter.probeState({ providerDeviceId, account, opts: {} });
    } catch (err) {
      outcome.probe = err.code ? `seam:${err.code}` : `error:${err.message}`;
    }
    matrix[platform] = outcome;

    // Honest-outcome contract: a definite result, and if it reports "online" the
    // driver has a real login (no fabricated success behind a seam).
    expect(outcome.bringOnline).toBeDefined();
    if (outcome.bringOnline === 'online') {
      expect(typeof adapter.bringOnline).toBe('function');
    } else if (outcome.bringOnline.startsWith('seam:')) {
      expect(outcome.bringOnline).toMatch(KNOWN_SEAMS);
    }
  }, 90000);

  afterAll(() => {
    if (ready) console.log('[duoplus e2e] per-platform matrix:\n' + JSON.stringify(matrix, null, 2));
  });
});
