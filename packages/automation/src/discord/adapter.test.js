import { jest } from '@jest/globals';

import { discordAdapter } from './adapter.js';
import { getPlatformAdapter } from '../platform-adapter.js';

const node = (text) => `<node index="0" text="${text}" bounds="[0,0][10,10]" />`;
const dump = (...texts) => `<hierarchy rotation="0">${texts.map(node).join('')}</hierarchy>`;

function makeController({ dumps = [], single = null } = {}) {
  let i = 0;
  return {
    startApp: jest.fn(async () => true),
    getUIDump: jest.fn(async () => {
      if (single != null) return single;
      const xml = dumps.length ? dumps[Math.min(i, dumps.length - 1)] : '';
      i += 1;
      return xml;
    }),
    tap: jest.fn(async () => {})
  };
}

describe('getPlatformAdapter("discord")', () => {
  it('resolves the discord driver', () => {
    const adapter = getPlatformAdapter('discord');
    expect(adapter).toBe(discordAdapter);
    expect(adapter.platform).toBe('discord');
    expect(typeof adapter.runAction).toBe('function');
  });
});

describe('discordAdapter.healthCheck', () => {
  it('maps a home screen -> logged_in', async () => {
    const controller = makeController({ single: dump('Messages', 'Servers') });
    await expect(discordAdapter.healthCheck(controller)).resolves.toMatchObject({ state: 'logged_in', success: true });
  });

  it('maps a disabled-account screen -> banned', async () => {
    const controller = makeController({ single: dump('Account Disabled') });
    const res = await discordAdapter.healthCheck(controller);
    expect(res.state).toBe('banned');
  });

  it('launches the Discord app BEFORE reading state (never interprets another app screen)', async () => {
    const order = [];
    const controller = {
      startApp: jest.fn(async () => { order.push('start'); return true; }),
      getUIDump: jest.fn(async () => { order.push('dump'); return dump('Messages', 'Servers'); }),
      tap: jest.fn(async () => {})
    };
    const res = await discordAdapter.healthCheck(controller);
    expect(controller.startApp).toHaveBeenCalledWith('com.discord', expect.any(String));
    expect(order[0]).toBe('start');
    expect(res.state).toBe('logged_in');
  });
});

describe('discordAdapter.runAction', () => {
  it('join returns ok on a confirmation signal', async () => {
    const controller = makeController({ dumps: [dump('Join'), dump('Channels')] });
    await expect(discordAdapter.runAction(controller, { type: 'join', target: 'inv1' }, {})).resolves.toEqual({
      ok: true
    });
  });

  it('rejects an unsupported action', async () => {
    const controller = makeController({ single: dump('Messages') });
    await expect(discordAdapter.runAction(controller, { type: 'publish' }, {})).rejects.toMatchObject({
      code: 'ACTION_TYPE_UNSUPPORTED'
    });
  });
});
