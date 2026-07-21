import { jest } from '@jest/globals';
import { parseUIDump } from '@acq/device-control';

import { checkWhatsappState, detectBanScreen, reportTarget, bringWhatsappOnline } from './ui-flows.js';
import { WHATSAPP_PACKAGE } from './constants.js';

// Build minimal accessibility-dump XML that the REAL parseUIDump can consume.
// `node(text)` → a single leaf; `dump(...texts)` → a full hierarchy of leaves.
// A leading attribute is required: the real ui-parser reads `text` via /\stext="/,
// so `text` must be preceded by whitespace (as it always is in a live dump).
const node = (text) => `<node index="0" text="${text}" bounds="[0,0][10,10]" />`;
const dump = (...texts) => `<hierarchy rotation="0">${texts.map(node).join('')}</hierarchy>`;

// Stateful fake controller: successive getUIDump() calls yield successive `dumps`
// entries (last one repeats). `single` returns the same XML for every call.
// shell/startApp/tap/getCurrentPackage are jest.fn recorders.
function makeController({ dumps = [], single = null } = {}) {
  let index = 0;
  const getUIDump = jest.fn(async () => {
    if (single != null) return single;
    const xml = dumps.length ? dumps[Math.min(index, dumps.length - 1)] : '';
    index += 1;
    return xml;
  });
  return {
    getUIDump,
    startApp: jest.fn(async () => true),
    shell: jest.fn(async () => ''),
    tap: jest.fn(async () => {}),
    getCurrentPackage: jest.fn(async () => WHATSAPP_PACKAGE),
    waitForForeground: jest.fn(async () => true)
  };
}

const HOME_XML = dump('Chats', 'Calls', 'Updates');
const BAN_XML = dump('Your account was banned', 'Tap for more info');
const LOGGED_OUT_XML = dump('Welcome to WhatsApp', 'Tap to agree to the Terms');

describe('detectBanScreen', () => {
  it('is true when the dump contains a ban phrase', () => {
    expect(detectBanScreen(parseUIDump(BAN_XML))).toBe(true);
  });
  it('is false for a normal home dump', () => {
    expect(detectBanScreen(parseUIDump(HOME_XML))).toBe(false);
  });
});

describe('checkWhatsappState', () => {
  it("returns 'logged_in' for a dump with >=2 home signatures and no ban text", async () => {
    const controller = makeController({ single: HOME_XML });
    await expect(checkWhatsappState(controller)).resolves.toBe('logged_in');
    expect(controller.startApp).toHaveBeenCalledWith(WHATSAPP_PACKAGE, expect.any(String));
  });

  it("returns 'banned' for a dump with a ban phrase", async () => {
    const controller = makeController({ single: BAN_XML });
    await expect(checkWhatsappState(controller)).resolves.toBe('banned');
  });

  it("returns 'logged_out' for a dump with unrelated text", async () => {
    const controller = makeController({ single: LOGGED_OUT_XML });
    await expect(checkWhatsappState(controller)).resolves.toBe('logged_out');
  });

  it("returns 'unknown' for an empty dump", async () => {
    const controller = makeController({ single: dump() });
    await expect(checkWhatsappState(controller)).resolves.toBe('unknown');
  });
});

describe('reportTarget', () => {
  it('walks the report/confirm path and issues the wa.me deep link', async () => {
    const controller = makeController({
      dumps: [
        dump('Type a message'), // ban-check after opening chat
        dump('More options'), // overflow menu selector
        dump('Report and block'), // report action
        dump('Reported. Messages archived.') // confirmation screen (contains "Reported")
      ]
    });

    const result = await reportTarget(controller, { targetMsisdn: '+491700000001', alsoBlock: true });

    expect(result).toEqual({ ok: true });
    // deep link opened the target chat with digits only.
    const shellCmd = controller.shell.mock.calls[0][0];
    expect(shellCmd).toContain('wa.me/491700000001');
    expect(shellCmd).toContain(WHATSAPP_PACKAGE);
    // selector-first path taken: taps land on the matched elements (~5,5), never
    // the provisional fallback points (x=1000 overflow / x=540 report).
    const tapXs = controller.tap.mock.calls.map(([x]) => x);
    expect(tapXs.length).toBeGreaterThan(0);
    expect(tapXs.every((x) => x < 100)).toBe(true);
  }, 30_000);

  it('short-circuits with banned:true and never taps Report when the chat opens on a ban screen', async () => {
    const controller = makeController({ dumps: [BAN_XML] });

    const result = await reportTarget(controller, { targetMsisdn: '+491700000001' });

    expect(result).toEqual({ ok: false, banned: true });
    expect(controller.shell).toHaveBeenCalledTimes(1); // deep link only
    expect(controller.tap).not.toHaveBeenCalled(); // did not proceed into the menu/report
  }, 30_000);

  it('does NOT claim success when the final screen shows neither ban nor confirmation', async () => {
    const controller = makeController({
      dumps: [
        dump('Type a message'), // chat opened, no ban
        dump('More options'), // overflow menu selector present
        dump('Report and block'), // report action present → tapped
        dump('Loading...') // no confirmation, no ban → must NOT be a false success
      ]
    });

    const result = await reportTarget(controller, { targetMsisdn: '+491700000001', alsoBlock: true });

    expect(result).toEqual({ ok: false });
    expect(result.banned).toBeUndefined();
    // the report flow WAS attempted (menu/report taps happened) — it just wasn't confirmed.
    expect(controller.tap).toHaveBeenCalled();
  }, 30_000);

  it('rejects an empty/non-numeric target before touching the device', async () => {
    const controller = makeController({ single: HOME_XML });
    await expect(reportTarget(controller, { targetMsisdn: '+++' })).rejects.toThrow('WHATSAPP_REPORT_TARGET_INVALID');
    expect(controller.shell).not.toHaveBeenCalled();
  });
});

describe('bringWhatsappOnline (session-import seam)', () => {
  it('refuses to run until a real session artifact is available', async () => {
    const controller = makeController({ single: HOME_XML });
    await expect(bringWhatsappOnline(controller, { sessionRef: 'keychain:x' })).rejects.toThrow(
      'WHATSAPP_SESSION_IMPORT_UNVERIFIED'
    );
  });

  it.todo('bringWhatsappOnline against a real session artifact');
});
