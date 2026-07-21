import { jest } from '@jest/globals';

import { handleYouTubeTwoFactor } from './ui-flows.js';
import { totpCandidates } from '@acq/integrations';

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
// Realistic uiautomator nodes: a focused code field + a Next button.
const DUMP =
  '<hierarchy>' +
  '<node index="0" text="" resource-id="" class="android.widget.EditText" bounds="[100,200][900,300]" />' +
  '<node index="1" text="Next" class="android.widget.Button" bounds="[100,400][900,500]" />' +
  '</hierarchy>';

function fakeController(dumpXml) {
  const typed = [];
  const taps = [];
  return {
    typed,
    taps,
    async getUIDump() { return dumpXml; },
    async tap(x, y) { taps.push([x, y]); },
    async inputText(v) { typed.push(v); },
    async clearField() {}
  };
}

test('types a valid TOTP code into the 2-Step field', async () => {
  // Freeze wall-clock time so the code-under-test's generateTOTP() (read early,
  // inside handleYouTubeTwoFactor) and this test's expected totpCandidates()
  // (read ~8s later, after the flow's real delays) observe the SAME 30s TOTP
  // window. Without this, those two Date.now() reads can straddle a window
  // boundary under a slow/loaded full-suite run — the generated code then no
  // longer matches the later-computed candidates and the assertion flakes.
  // delay() uses setTimeout (real timers), so mocking Date.now only pins the
  // TOTP counter; the flow's timing is untouched.
  const FIXED_NOW = 1_700_000_000_000; // fixed instant; value is arbitrary since both reads share it
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  try {
    const c = fakeController(DUMP);
    await handleYouTubeTwoFactor(c, SECRET);
    const candidates = totpCandidates(SECRET);
    expect(c.typed.some((v) => candidates.includes(v))).toBe(true);
  } finally {
    nowSpy.mockRestore();
  }
}, 20_000);

test('no-op when no TOTP seed (caller checkpoints)', async () => {
  const c = fakeController(DUMP);
  await handleYouTubeTwoFactor(c, '');
  expect(c.typed).toEqual([]);
});
