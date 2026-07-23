import { buildActionRunner } from './action-runner.js';

const node = (t) => `<node index="0" text="${t}" bounds="[0,0][10,10]" />`;
const dump = (...t) => `<hierarchy rotation="0">${t.map(node).join('')}</hierarchy>`;

function controller(screens) {
  let i = 0;
  return { getUIDump: async () => screens[Math.min(i++, screens.length - 1)], tap: async () => {} };
}

describe('buildActionRunner (generic §9.4 action dispatch)', () => {
  const run = buildActionRunner({
    platform: 'instagram',
    banTexts: ['account disabled'],
    checkpointTexts: ['confirm it\'s you'],
    actions: {
      follow: { triggerTexts: ['Follow'], confirmTexts: ['Following'] },
      like: { triggerTexts: ['Like'], confirmTexts: ['Liked'] }
    },
    special: { publish: async () => ({ ok: true, published: true }) }
  });

  it('confirms a tap action by fact (Follow -> Following)', async () => {
    const c = controller([dump('Follow'), dump('Following')]);
    await expect(run(c, { type: 'follow', target: '@x' }, {})).resolves.toEqual({ ok: true });
  });

  it('routes a special action (publish) to its handler', async () => {
    await expect(run(controller([dump('x')]), { type: 'publish' }, {})).resolves.toMatchObject({ published: true });
  });

  it('reports ACTION_NOT_CONFIRMED when no confirm signal appears', async () => {
    const c = controller([dump('Like'), dump('nothing')]);
    await expect(run(c, { type: 'like' }, {})).rejects.toMatchObject({ code: 'ACTION_NOT_CONFIRMED' });
  });

  it('detects a ban mid-flow instead of a false success', async () => {
    const c = controller([dump('Account disabled')]);
    await expect(run(c, { type: 'follow' }, {})).resolves.toEqual({ ok: false, banned: true });
  });

  it('an unsupported action is an honest coded seam', async () => {
    await expect(run(controller([dump('x')]), { type: 'nope' }, {})).rejects.toMatchObject({ code: 'ACTION_TYPE_UNSUPPORTED' });
  });
});
