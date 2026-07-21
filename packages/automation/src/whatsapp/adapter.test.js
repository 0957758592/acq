import { jest } from '@jest/globals';

import { whatsappAdapter } from './adapter.js';
import { getPlatformAdapter } from '../platform-adapter.js';
import { WHATSAPP_PACKAGE } from './constants.js';

// Build minimal accessibility-dump XML that the REAL parseUIDump can consume.
// Mirrors ui-flows.test.js: `node(text)` → a single leaf; `dump(...texts)` → a
// full hierarchy of leaves. A leading whitespace before `text` is required so
// the real ui-parser's /\stext="/ matches.
const node = (text) => `<node index="0" text="${text}" bounds="[0,0][10,10]" />`;
const dump = (...texts) => `<hierarchy rotation="0">${texts.map(node).join('')}</hierarchy>`;

// Stateful fake controller (same shape as ui-flows.test.js): successive
// getUIDump() calls yield successive `dumps` entries (last repeats); `single`
// returns the same XML for every call.
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

describe('getPlatformAdapter("whatsapp")', () => {
  it('resolves the whatsapp adapter with login/healthCheck/report functions', () => {
    const adapter = getPlatformAdapter('whatsapp');
    expect(adapter).toBe(whatsappAdapter);
    expect(adapter.platform).toBe('whatsapp');
    expect(typeof adapter.login).toBe('function');
    expect(typeof adapter.healthCheck).toBe('function');
    expect(typeof adapter.report).toBe('function');
  });
});

describe('whatsappAdapter.healthCheck', () => {
  it('maps a logged-in home screen → active/logged_in', async () => {
    const controller = makeController({ single: HOME_XML });
    await expect(whatsappAdapter.healthCheck(controller)).resolves.toEqual({
      success: true,
      status: 'active',
      state: 'logged_in',
      reason: 'logged_in'
    });
  });

  it('maps a banned screen → banned/banned', async () => {
    const controller = makeController({ single: BAN_XML });
    await expect(whatsappAdapter.healthCheck(controller)).resolves.toEqual({
      success: false,
      status: 'banned',
      state: 'banned',
      reason: 'banned'
    });
  });
});

describe('whatsappAdapter.report', () => {
  it('delegates to the ui-flows report/confirm happy path → { ok: true }', async () => {
    const controller = makeController({
      dumps: [
        dump('Type a message'), // ban-check after opening chat
        dump('More options'), // overflow menu selector
        dump('Report and block'), // report action
        dump('Reported. Messages archived.') // confirmation screen
      ]
    });

    const result = await whatsappAdapter.report(controller, {
      targetMsisdn: '+491700000001',
      alsoBlock: true
    });

    expect(result).toEqual({ ok: true });
    expect(controller.shell.mock.calls[0][0]).toContain('wa.me/491700000001');
  }, 30_000);
});

describe('whatsappAdapter.login (session-import seam)', () => {
  it('refuses to run until a real session artifact is available', async () => {
    const controller = makeController({ single: HOME_XML });
    await expect(
      whatsappAdapter.login(controller, { secretRefs: { session: 'keychain:x' } })
    ).rejects.toThrow('WHATSAPP_SESSION_IMPORT_UNVERIFIED');
  });
});
