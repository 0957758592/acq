import { jest } from '@jest/globals';

import { anyTextPresent, runConfirmedAction } from './confirmed-action.js';
import { parseUIDump } from '@acq/device-control';

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

const cfg = {
  banTexts: ['banned'],
  checkpointTexts: ['verify'],
  dismissTexts: ['OK'],
  triggerTexts: ['JOIN'],
  confirmTexts: ['Joined']
};

describe('anyTextPresent', () => {
  test('true when any needle appears (case-insensitive)', () => {
    const nodes = parseUIDump(dump('You JOINED now'));
    expect(anyTextPresent(nodes, ['joined'])).toBe(true);
  });
  test('false when none appear', () => {
    expect(anyTextPresent(parseUIDump(dump('nope')), ['joined'])).toBe(false);
  });
});

describe('runConfirmedAction', () => {
  test('returns ok when a confirmation signal appears', async () => {
    const controller = makeController({ dumps: [dump('JOIN'), dump('Joined')] });
    await expect(runConfirmedAction(controller, cfg)).resolves.toEqual({ ok: true });
  });

  test('reports banned when a ban screen shows up', async () => {
    const controller = makeController({ single: dump('You are banned') });
    await expect(runConfirmedAction(controller, cfg)).resolves.toEqual({ ok: false, banned: true });
  });

  test('reports checkpointed on a verification wall', async () => {
    const controller = makeController({ single: dump('Please verify') });
    await expect(runConfirmedAction(controller, cfg)).resolves.toEqual({ ok: false, checkpointed: true });
  });

  test('throws ACTION_NOT_CONFIRMED when no confirmation appears', async () => {
    const controller = makeController({ single: dump('JOIN') });
    await expect(runConfirmedAction(controller, cfg)).rejects.toMatchObject({ code: 'ACTION_NOT_CONFIRMED' });
  });
});
