import { buildLoginRunner } from './login-runner.js';

const node = (t) => `<node index="0" text="${t}" bounds="[0,0][10,10]" />`;
const dump = (...t) => `<hierarchy rotation="0">${t.map(node).join('')}</hierarchy>`;

function controller(screens) {
  let i = 0;
  const calls = { started: false, typed: [] };
  return {
    calls,
    startApp: async () => { calls.started = true; return true; },
    getUIDump: async () => screens[Math.min(i++, screens.length - 1)],
    tap: async () => {},
    inputText: async (t) => calls.typed.push(t)
  };
}

const login = buildLoginRunner({
  platform: 'discord',
  appPackage: 'com.discord',
  homeTexts: ['Messages', 'Servers'],
  loginTexts: ['Log In', 'Email', 'Password'],
  banTexts: ['account disabled'],
  checkpointTexts: ['verify'],
  usernameHints: ['Email'],
  passwordHints: ['Password'],
  submitTexts: ['Log In'],
  settleMs: 0
});

describe('buildLoginRunner (§9.4 generic login)', () => {
  it('returns ok:true when the app is already on the home screen', async () => {
    const c = controller([dump('Messages', 'Servers')]);
    await expect(login(c, {}, {})).resolves.toEqual({ ok: true });
    expect(c.calls.started).toBe(true);
  });

  it('detects a banned account instead of a fake login', async () => {
    await expect(login(controller([dump('Account disabled')]), {}, {})).resolves.toEqual({ ok: false, banned: true });
  });

  it('requires credentials at the login screen (honest seam)', async () => {
    await expect(login(controller([dump('Log In', 'Email', 'Password')]), {}, {}))
      .rejects.toMatchObject({ code: 'DISCORD_CREDENTIALS_REQUIRED' });
  });

  it('enters credentials and confirms by fact (login screen -> home)', async () => {
    const c = stateController((calls) => (calls.typed.includes('p') ? dump('Messages', 'Servers') : dump('Log In', 'Email', 'Password')));
    const res = await login(c, { credentials: { email: 'u@x', password: 'p' } }, { actor: fakeActor });
    expect(res).toEqual({ ok: true });
    expect(c.calls.typed).toEqual(expect.arrayContaining(['u@x', 'p']));
  });

  it('is an honest verify-by-fact seam when login is not confirmed', async () => {
    const c = stateController((calls) => (calls.typed.includes('p') ? dump('still on login') : dump('Log In', 'Email', 'Password')));
    await expect(login(c, { credentials: { email: 'u@x', password: 'p' } }, { actor: fakeActor }))
      .rejects.toMatchObject({ code: 'DISCORD_LOGIN_UNVERIFIED' });
  });
});

const fakeActor = { tapElement: async () => {}, findAndTap: async () => {} };
function stateController(screenFn) {
  const calls = { started: false, typed: [] };
  return {
    calls,
    startApp: async () => { calls.started = true; return true; },
    getUIDump: async () => screenFn(calls),
    tap: async () => {},
    inputText: async (t) => calls.typed.push(t)
  };
}
