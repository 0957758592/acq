import { jest } from '@jest/globals';

import { facebookAdapter } from './adapter.js';
import { getPlatformAdapter } from '../platform-adapter.js';

const node = (text) => `<node index="0" text="${text}" bounds="[0,0][10,10]" />`;
const dump = (...texts) => `<hierarchy rotation="0">${texts.map(node).join('')}</hierarchy>`;

function makeController({ dumps = [], single = null } = {}) {
  let i = 0;
  return {
    getUIDump: jest.fn(async () => {
      if (single != null) return single;
      const xml = dumps.length ? dumps[Math.min(i, dumps.length - 1)] : '';
      i += 1;
      return xml;
    }),
    tap: jest.fn(async () => {})
  };
}

describe('getPlatformAdapter("facebook")', () => {
  it('resolves the facebook driver', () => {
    expect(getPlatformAdapter('facebook')).toBe(facebookAdapter);
    expect(facebookAdapter.platform).toBe('facebook');
  });
});

describe('facebookAdapter.healthCheck', () => {
  it('maps a suspended-account screen -> banned', async () => {
    const controller = makeController({ single: dump('We suspended your account') });
    expect((await facebookAdapter.healthCheck(controller)).state).toBe('banned');
  });
});

describe('facebookAdapter.runAction', () => {
  it('like returns ok on a confirmation signal', async () => {
    const controller = makeController({ dumps: [dump('Like'), dump('Liked')] });
    await expect(facebookAdapter.runAction(controller, { type: 'like', target: 'p1' }, {})).resolves.toEqual({
      ok: true
    });
  });

  it('rejects an unsupported action', async () => {
    const controller = makeController({ single: dump('Home') });
    await expect(facebookAdapter.runAction(controller, { type: 'dm' }, {})).rejects.toMatchObject({
      code: 'ACTION_TYPE_UNSUPPORTED'
    });
  });
});
