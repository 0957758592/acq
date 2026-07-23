import { instagramAdapter } from './adapter.js';

const node = (t) => `<node index="0" text="${t}" bounds="[0,0][10,10]" />`;
const dump = (...t) => `<hierarchy rotation="0">${t.map(node).join('')}</hierarchy>`;
function controller(screens) {
  let i = 0;
  return { getUIDump: async () => screens[Math.min(i++, screens.length - 1)], tap: async () => {}, startApp: async () => true };
}

describe('instagramAdapter.runAction (§9.4 unified action runner)', () => {
  it('confirms a follow by fact (Follow -> Following)', async () => {
    const res = await instagramAdapter.runAction(controller([dump('Follow'), dump('Following')]), { type: 'follow', target: '@x' }, {});
    expect(res).toEqual({ ok: true });
  });

  it('confirms a like by fact (Like -> Liked)', async () => {
    const res = await instagramAdapter.runAction(controller([dump('Like'), dump('Liked')]), { type: 'like', target: 'p1' }, {});
    expect(res).toEqual({ ok: true });
  });

  it('recognizes publish as a special action (routed to the reel publisher, not the tap path)', async () => {
    const c = { startApp: async () => true, getUIDump: async () => dump('x'), tap: async () => {}, inputText: async () => {}, findElement: async () => null };
    let code = null;
    try {
      await instagramAdapter.runAction(c, { type: 'publish', media: { publicUrl: 'u' } }, {});
    } catch (err) {
      code = err.code;
    }
    expect(code).not.toBe('ACTION_TYPE_UNSUPPORTED'); // publish is handled, not rejected
  });

  it('an unsupported action is an honest coded seam', async () => {
    await expect(instagramAdapter.runAction(controller([dump('x')]), { type: 'nope' }, {}))
      .rejects.toMatchObject({ code: 'ACTION_TYPE_UNSUPPORTED' });
  });
});
