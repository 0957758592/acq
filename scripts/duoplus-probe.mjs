#!/usr/bin/env node
// Quick DuoPlus connectivity probe — lists the cloud phones in the real account
// and locates the target device (default 'mattclone_duo'), printing id/name/
// status/adb for each. Read-only: no power state changes. Use it to confirm the
// API key works and the device name before running the full e2e live test.
//
//   DUOPLUS_API_KEY=<key> node scripts/duoplus-probe.mjs [deviceNameOrId]
import { createDeviceProvider } from '@acq/device-control';

const API_KEY = process.env.DUOPLUS_API_KEY;
const BASE_URL = process.env.DUOPLUS_API_BASE_URL || 'https://openapi.duoplus.net';
const TARGET = process.argv[2] || process.env.DUOPLUS_TEST_DEVICE || 'mattclone_duo';

if (!API_KEY) {
  console.error('DUOPLUS_API_KEY is required. Run: DUOPLUS_API_KEY=<key> node scripts/duoplus-probe.mjs [device]');
  process.exit(2);
}

const provider = createDeviceProvider({ type: 'duoplus', apiKey: API_KEY, baseUrl: BASE_URL });

function rows(list) {
  return Array.isArray(list) ? list : list?.data?.list ?? list?.data ?? list?.list ?? [];
}
const nameOf = (p) => String(p?.name || p?.image_id || p?.imageId || p?.id || '').trim();
const idOf = (p) => String(p?.id || p?.image_id || p?.imageId || '').trim();

const phones = rows(await provider.listDevices({ page: 1, pagesize: 100 }));
console.log(`DuoPlus phones (${phones.length}):`);
for (const p of phones) {
  console.log(`  - id=${idOf(p)}  name="${nameOf(p)}"  status=${p?.status ?? '?'}  adb=${p?.adb || p?.adbAddress || '-'}`);
}

const match = phones.find((p) => nameOf(p).toLowerCase() === TARGET.toLowerCase())
  || phones.find((p) => nameOf(p).toLowerCase().includes(TARGET.toLowerCase()))
  || phones.find((p) => idOf(p) === TARGET);

if (!match) {
  console.error(`\nTarget "${TARGET}" NOT found.`);
  process.exit(1);
}
console.log(`\nTarget "${TARGET}" -> id=${idOf(match)} name="${nameOf(match)}"`);
const info = await provider.describeInstance(idOf(match)).catch((e) => ({ error: e.message }));
console.log('describeInstance:', JSON.stringify(info, null, 2));
