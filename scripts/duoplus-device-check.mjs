#!/usr/bin/env node
// Proves the DuoPlus DEVICE layer end-to-end over the real OpenAPI (no ADB
// needed): describeInstance + getAdbConnection + screenshot for one device.
//   DUOPLUS_API_KEY=<key> node scripts/duoplus-device-check.mjs <deviceId>
import { createDeviceProvider } from '@acq/device-control';

const API_KEY = process.env.DUOPLUS_API_KEY;
const BASE_URL = process.env.DUOPLUS_API_BASE_URL || 'https://openapi.duoplus.net';
const ID = process.argv[2] || process.env.DUOPLUS_TEST_DEVICE_ID;
if (!API_KEY || !ID) { console.error('need DUOPLUS_API_KEY and a device id'); process.exit(2); }

const provider = createDeviceProvider({ type: 'duoplus', apiKey: API_KEY, baseUrl: BASE_URL });

const info = await provider.describeInstance(ID).catch((e) => ({ error: `${e.code || ''} ${e.message}` }));
console.log('describeInstance:', JSON.stringify(info, null, 2));

const adb = await provider.getAdbConnection(ID).catch((e) => ({ error: `${e.code || ''} ${e.message}` }));
console.log('getAdbConnection:', JSON.stringify(adb, null, 2));

const shot = await provider.screenshot(ID).catch((e) => ({ error: `${e.code || ''} ${e.message}` }));
// screenshot returns preview image payload; print only shape, not raw bytes.
const shape = shot?.error ? shot : { keys: Object.keys(shot || {}), code: shot?.code, hasData: Boolean(shot?.data) };
console.log('screenshot(shape):', JSON.stringify(shape, null, 2));
