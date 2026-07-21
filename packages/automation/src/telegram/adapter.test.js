import { jest } from '@jest/globals';

import { telegramAdapter } from './adapter.js';
import { getPlatformAdapter } from '../platform-adapter.js';
import { TELEGRAM_PACKAGE } from './constants.js';

const node = (text) => `<node index="0" text="${text}" bounds="[0,0][10,10]" />`;
const dump = (...texts) => `<hierarchy rotation="0">${texts.map(node).join('')}</hierarchy>`;

function makeController({ dumps = [], single = null } = {}) {
  let index = 0;
  return {
    getUIDump: jest.fn(async () => {
      if (single != null) return single;
      const xml = dumps.length ? dumps[Math.min(index, dumps.length - 1)] : '';
      index += 1;
      return xml;
    }),
    startApp: jest.fn(async () => true),
    shell: jest.fn(async () => ''),
    tap: jest.fn(async () => {}),
    getCurrentPackage: jest.fn(async () => TELEGRAM_PACKAGE)
  };
}

const HOME_XML = dump('Chats', 'Contacts', 'Settings');
const BAN_XML = dump('This account has been banned', 'Tap for more info');

describe('getPlatformAdapter("telegram")', () => {
  it('resolves the telegram driver with the PlatformDriver surface', () => {
    const adapter = getPlatformAdapter('telegram');
    expect(adapter).toBe(telegramAdapter);
    expect(adapter.platform).toBe('telegram');
    expect(typeof adapter.login).toBe('function');
    expect(typeof adapter.healthCheck).toBe('function');
    expect(typeof adapter.runAction).toBe('function');
  });
});

describe('telegramAdapter.healthCheck', () => {
  it('maps a logged-in home screen -> active/logged_in', async () => {
    const controller = makeController({ single: HOME_XML });
    await expect(telegramAdapter.healthCheck(controller)).resolves.toMatchObject({
      success: true,
      state: 'logged_in'
    });
  });

  it('maps a ban screen -> banned', async () => {
    const controller = makeController({ single: BAN_XML });
    const res = await telegramAdapter.healthCheck(controller);
    expect(res.state).toBe('banned');
    expect(res.success).toBe(false);
  });
});

describe('telegramAdapter.login (session-import seam)', () => {
  it('throws TELEGRAM_SESSION_IMPORT_UNVERIFIED until the session format is confirmed', async () => {
    const controller = makeController({ single: HOME_XML });
    await expect(
      telegramAdapter.login(controller, { secretRefs: { session: 'vault:tg-1' } })
    ).rejects.toMatchObject({ code: 'TELEGRAM_SESSION_IMPORT_UNVERIFIED' });
  });
});

describe('telegramAdapter.runAction', () => {
  it('rejects an unsupported action type', async () => {
    const controller = makeController({ single: HOME_XML });
    await expect(
      telegramAdapter.runAction(controller, { type: 'publish', target: '@x' }, {})
    ).rejects.toMatchObject({ code: 'ACTION_TYPE_UNSUPPORTED' });
  });

  it('join returns ok when a confirmation signal appears', async () => {
    // First dump: the JOIN button; later dumps: joined channel (Mute/message box).
    const controller = makeController({
      dumps: [dump('JOIN'), dump('Mute'), dump('Mute')]
    });
    const res = await telegramAdapter.runAction(controller, { type: 'join', target: '@chan' }, {});
    expect(res.ok).toBe(true);
  });

  it('join throws ACTION_NOT_CONFIRMED when no confirmation appears', async () => {
    const controller = makeController({ single: dump('JOIN') });
    await expect(
      telegramAdapter.runAction(controller, { type: 'join', target: '@chan' }, {})
    ).rejects.toMatchObject({ code: 'ACTION_NOT_CONFIRMED' });
  });

  it('detects a mid-flow ban and reports it', async () => {
    const controller = makeController({ single: BAN_XML });
    const res = await telegramAdapter.runAction(controller, { type: 'join', target: '@chan' }, {});
    expect(res.banned).toBe(true);
    expect(res.ok).toBe(false);
  });
});
