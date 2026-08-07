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

describe('buildLoginRunner prereg flow (preLoginTapTexts)', () => {
  it('taps through the prereg screen to the credential form, then logs in', async () => {
    const login2 = buildLoginRunner({
      platform: 'linkedin', appPackage: 'com.linkedin.android',
      homeTexts: ['My Network'], loginTexts: ['Sign in with Email'],
      preLoginTapTexts: ['Sign in with Email'],
      usernameHints: ['email_address'], passwordHints: ['Password'], submitTexts: ['Sign in'], settleMs: 0
    });
    const calls = { started: false, typed: [], preTapped: false };
    const actor = { tapElement: async () => {}, findAndTap: async (texts = []) => { if (texts.includes('Sign in with Email')) calls.preTapped = true; } };
    const form = '<hierarchy rotation="0"><node text="" resource-id="growth_login_join_fragment_email_address" bounds="[0,0][10,10]" /><node text="" resource-id="growth_login_join_fragment_password" bounds="[0,20][10,30]" /><node text="Sign in" bounds="[0,40][10,50]" /></hierarchy>';
    const c = {
      calls,
      startApp: async () => { calls.started = true; },
      getUIDump: async () => (calls.typed.includes('pw') ? dump('My Network') : (calls.preTapped ? form : dump('Sign in with Email', 'New to LinkedIn?'))),
      tap: async () => {},
      inputText: async (t) => calls.typed.push(t)
    };
    const res = await login2(c, { credentials: { email: 'e@x', password: 'pw' } }, { actor });
    expect(calls.preTapped).toBe(true); // advanced past the prereg screen
    expect(res).toEqual({ ok: true });
    expect(calls.typed).toEqual(expect.arrayContaining(['e@x', 'pw']));
  });
});
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
