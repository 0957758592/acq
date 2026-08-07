import { jest } from '@jest/globals';

import { linkedinAdapter } from './adapter.js';
import { getPlatformAdapter } from '../platform-adapter.js';

const node = (text) => `<node index="0" text="${text}" bounds="[0,0][10,10]" />`;
const dump = (...texts) => `<hierarchy rotation="0">${texts.map(node).join('')}</hierarchy>`;

function makeController({ single = null } = {}) {
  return {
    startApp: jest.fn(async () => true),
    getUIDump: jest.fn(async () => single ?? ''),
    tap: jest.fn(async () => {})
  };
}

describe('getPlatformAdapter("linkedin")', () => {
  it('resolves the linkedin driver with login + runAction', () => {
    const adapter = getPlatformAdapter('linkedin');
    expect(adapter).toBe(linkedinAdapter);
    expect(adapter.platform).toBe('linkedin');
    expect(typeof adapter.login).toBe('function');
    expect(typeof adapter.runAction).toBe('function');
  });
});

describe('linkedinAdapter.healthCheck', () => {
  it('maps a home screen -> logged_in / active', async () => {
    const controller = makeController({ single: dump('My Network', 'Jobs') });
    await expect(linkedinAdapter.healthCheck(controller)).resolves.toMatchObject({ state: 'logged_in', success: true, status: 'active' });
  });

  it('maps a restricted-account screen -> banned', async () => {
    const controller = makeController({ single: dump('This account is restricted') });
    expect((await linkedinAdapter.healthCheck(controller)).state).toBe('banned');
  });

  it('maps a security-check screen -> checkpoint', async () => {
    const controller = makeController({ single: dump("Let's do a quick security check") });
    expect((await linkedinAdapter.healthCheck(controller)).state).toBe('checkpoint');
  });

  it('a sign-in screen -> logged_out', async () => {
    const controller = makeController({ single: dump('New to LinkedIn?', 'Sign in') });
    expect((await linkedinAdapter.healthCheck(controller)).state).toBe('logged_out');
  });

  it('launches the LinkedIn app BEFORE reading state', async () => {
    const controller = makeController({ single: dump('My Network') });
    await linkedinAdapter.healthCheck(controller);
    expect(controller.startApp).toHaveBeenCalled();
  });
});

describe('linkedinAdapter.runAction', () => {
  it('rejects an unsupported action with a coded error', async () => {
    const controller = makeController({ single: dump('') });
    await expect(linkedinAdapter.runAction(controller, { type: 'nope' })).rejects.toMatchObject({ code: 'ACTION_TYPE_UNSUPPORTED' });
  });
});
