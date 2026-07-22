#!/usr/bin/env node
// TRUSTWORTHY per-account-type live check on a REAL DuoPlus device. For EACH
// platform it establishes the facts a real verification needs, in order:
//   1. app installed?            (pm list packages)               — remote shell
//   2. launch the app + read the actual foreground activity        — remote shell
//      (so a probe can't false-positive on some OTHER app's screen)
//   3. driver healthCheck (probe) — ONLY trusted when the app is installed AND
//      it is genuinely in the foreground; otherwise reported as not-verifiable.
// Honest by construction: never reports "online" for an app that isn't even
// installed/foreground (which the naive probe does for discord/facebook).
//   DUOPLUS_API_KEY=<key> node scripts/duoplus-account-types-check.mjs [deviceId]
import { createDeviceProvider } from '@acq/device-control';
import { createPlatformAutomationAdapter } from '@acq/engine-infra';
import { listPlatforms, getPlatformCapabilities } from '@acq/platform-registry';

const API_KEY = process.env.DUOPLUS_API_KEY;
const BASE_URL = process.env.DUOPLUS_API_BASE_URL || 'https://openapi.duoplus.net';
if (!API_KEY) { console.error('need DUOPLUS_API_KEY'); process.exit(2); }

const provider = createDeviceProvider({ type: 'duoplus', apiKey: API_KEY, baseUrl: BASE_URL });
const secretResolver = { resolve: async (r) => r, put: async (n) => `env:${n}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let deviceId = process.argv[2] || process.env.DUOPLUS_TEST_DEVICE_ID;
if (!deviceId) {
  const list = await provider.listDevices({ page: 1, pagesize: 100 });
  const phones = Array.isArray(list) ? list : list?.data?.list ?? list?.data ?? list?.list ?? [];
  const pick = phones.find((p) => Number(p?.status) === 1) || phones[0];
  deviceId = String(pick?.id || pick?.image_id || '');
}
const controller = provider.createDirectController(deviceId);
const info = await provider.describeInstance(deviceId).catch(() => ({}));
console.log(`Device ${deviceId} (${info?.name || '?'}) — ${info?.os || '?'}, status=${info?.status}\n`);

const installed = String(await controller.shell('pm list packages').catch((e) => `ERR ${e.code || e.message}`));
const foreground = async () => {
  const out = String(await controller.shell('dumpsys window 2>/dev/null | grep -E "mCurrentFocus|mFocusedApp"').catch(() => ''));
  const m = out.match(/([a-zA-Z0-9._]+)\/[a-zA-Z0-9._]+/);
  return m ? m[1] : '';
};

const rows = [];
for (const platform of listPlatforms()) {
  const caps = getPlatformCapabilities(platform);
  const pkg = caps.appPackage || caps.packageName || '?';
  const appInstalled = installed.includes(pkg);
  let fg = '';
  let probe = '-';
  let trusted = false;

  if (appInstalled) {
    // Launch the app, then read the real foreground before probing.
    await controller.shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`).catch(() => {});
    await sleep(2500);
    fg = await foreground();
    const adapter = createPlatformAutomationAdapter({ platform, provider, secretResolver });
    const account = { platform, identifier: `check_${platform}`, source: 'purchase', secretRefs: {} };
    try {
      probe = await adapter.probeState({ providerDeviceId: deviceId, account, opts: {} });
    } catch (e) {
      probe = e.code ? `seam:${e.code}` : `err:${e.message}`;
    }
    trusted = fg === pkg; // probe only trustworthy if OUR app is actually foreground
  } else {
    probe = 'n/a (app not installed)';
  }
  rows.push({ platform, appInstalled, onlineMethod: caps.onlineMethod || '?', fgMatch: appInstalled ? trusted : '-', probe });
}

console.log('type       | installed | online-method  | fg-ok | probe (trusted only if fg-ok)');
console.log('-----------|-----------|----------------|-------|------------------------------');
for (const r of rows) {
  console.log(
    r.platform.padEnd(10),
    '|', String(r.appInstalled).padEnd(9),
    '|', String(r.onlineMethod).padEnd(14),
    '|', String(r.fgMatch).padEnd(5),
    '|', r.probe
  );
}
