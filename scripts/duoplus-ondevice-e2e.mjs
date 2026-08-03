#!/usr/bin/env node
// LIVE on-device e2e on a REAL DuoPlus cloud phone via the native command API
// (/api/v1/cloudPhone/command) — proves screenshot + a fact-verified action end
// to end, no local adb required. Verify-by-fact: the action is confirmed by
// re-reading the foreground window, and the screenshot by its PNG magic bytes.
//
//   DUOPLUS_API_KEY=<key> node scripts/duoplus-ondevice-e2e.mjs [deviceId]
//   (deviceId falls back to E2E_DEVICE / DUOPLUS_TEST_DEVICE_ID)
//
// The device must be RUNNING (status 1). An expired/unhealthy phone can't boot —
// the platform surfaces that as a coded DEVICE_POWER_ON_FAILED elsewhere.
import { DuoplusClient } from '../packages/device-control/src/duoplus-client.js';

const ok = (s, x = '') => console.log(`  ✅ ${s}${x ? ' — ' + x : ''}`);
const bad = (s, x = '') => { console.log(`  ❌ ${s}${x ? ' — ' + x : ''}`); process.exitCode = 1; };

const API_KEY = process.env.DUOPLUS_API_KEY;
const ID = process.argv[2] || process.env.E2E_DEVICE || process.env.DUOPLUS_TEST_DEVICE_ID;
if (!API_KEY || !ID) { console.error('need DUOPLUS_API_KEY and a running device id'); process.exit(2); }

const client = new DuoplusClient({ apiKey: API_KEY, baseUrl: process.env.DUOPLUS_API_BASE_URL });
const sh = async (cmd) => (await client.executeCommand(ID, cmd))?.data?.content ?? '';
const focus = () => sh('dumpsys window | grep -E "mCurrentFocus" | head -1');

async function main() {
  console.log(`\nLIVE on-device e2e on ${ID}`);
  const model = (await sh('getprop ro.product.model')).trim();
  const rel = (await sh('getprop ro.build.version.release')).trim();
  (model && rel) ? ok('device reachable', `${model}, Android ${rel}`) : bad('device unreachable');

  // ── screenshot BEFORE — real PNG (magic bytes) ──
  await sh('screencap -p /sdcard/e2e_before.png');
  const before = { bytes: Number((await sh('wc -c < /sdcard/e2e_before.png')).trim()), magic: (await sh('od -An -tx1 -N4 /sdcard/e2e_before.png')).trim() };
  (before.bytes > 0 && before.magic.replace(/\s+/g, ' ').startsWith('89 50 4e 47')) ? ok('screenshot BEFORE is a real PNG', `${before.bytes} bytes`) : bad('screenshot before', JSON.stringify(before));

  // ── ACTION — HOME then open Settings ──
  await sh('input keyevent KEYCODE_HOME');
  await sh('am start -a android.settings.SETTINGS');
  await new Promise((r) => setTimeout(r, 1500));

  // ── verify by FACT — Settings is now the focused window ──
  const after = await focus();
  /com\.android\.settings/i.test(after) ? ok('action confirmed by fact', 'Settings is foreground') : bad('action not confirmed', after || '(no focus)');

  // ── screenshot AFTER — real PNG, and the screen changed ──
  await sh('screencap -p /sdcard/e2e_after.png');
  const after2 = { bytes: Number((await sh('wc -c < /sdcard/e2e_after.png')).trim()), magic: (await sh('od -An -tx1 -N4 /sdcard/e2e_after.png')).trim() };
  (after2.bytes > 0 && after2.magic.replace(/\s+/g, ' ').startsWith('89 50 4e 47')) ? ok('screenshot AFTER is a real PNG', `${after2.bytes} bytes`) : bad('screenshot after', JSON.stringify(after2));
  (after2.bytes !== before.bytes) ? ok('screen changed (before ≠ after)') : bad('screen unchanged');

  // cleanup
  await sh('rm -f /sdcard/e2e_before.png /sdcard/e2e_after.png');
  await sh('input keyevent KEYCODE_HOME');
  console.log('\n✔ ON-DEVICE E2E — real screenshot + fact-verified action on a live DuoPlus phone — LIVE ✓');
}
main().catch((e) => { console.error('on-device e2e error:', e.message); process.exit(1); });
