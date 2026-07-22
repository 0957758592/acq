import { jest } from '@jest/globals';

import { gmailAdapter } from './adapter.js';
import { getPlatformAdapter } from '../platform-adapter.js';

const node = (text) => `<node index="0" text="${text}" bounds="[0,0][10,10]" />`;
const dump = (...texts) => `<hierarchy rotation="0">${texts.map(node).join('')}</hierarchy>`;

function makeController(single) {
  return { getUIDump: jest.fn(async () => single) };
}

describe('getPlatformAdapter("gmail")', () => {
  it('resolves the gmail driver', () => {
    expect(getPlatformAdapter('gmail')).toBe(gmailAdapter);
    expect(gmailAdapter.platform).toBe('gmail');
  });
});

describe('gmailAdapter.healthCheck', () => {
  it('maps an inbox screen -> logged_in', async () => {
    const res = await gmailAdapter.healthCheck(makeController(dump('Primary', 'Compose')));
    expect(res.state).toBe('logged_in');
  });
});

describe('gmailAdapter.runAction read-code', () => {
  it('extracts a verification code from the visible message', async () => {
    const res = await gmailAdapter.runAction(makeController(dump('Your code is 483920', 'Primary')), { type: 'read-code' }, {});
    expect(res).toEqual({ ok: true, code: '483920' });
  });

  it('throws VERIFICATION_CODE_TIMEOUT when no code is visible', async () => {
    await expect(
      gmailAdapter.runAction(makeController(dump('Welcome to Gmail')), { type: 'read-code' }, {})
    ).rejects.toMatchObject({ code: 'VERIFICATION_CODE_TIMEOUT' });
  });

  it('rejects a non read-code action', async () => {
    await expect(
      gmailAdapter.runAction(makeController(dump('Primary')), { type: 'follow' }, {})
    ).rejects.toMatchObject({ code: 'ACTION_TYPE_UNSUPPORTED' });
  });
});
