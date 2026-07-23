import { AdbClient } from '../adb-client.js';

// Fake exec: routes by the shell command inside args and returns canned stdout.
function fakeExec(routes) {
  const calls = [];
  return async (_bin, args) => {
    calls.push(args);
    const cmd = args[0] === 'shell' ? args.slice(1).join(' ') : args.join(' ');
    for (const [pattern, out] of routes) {
      if (cmd.includes(pattern)) return { stdout: out, stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
}

describe('AdbClient — Controller UI surface (§5.2, GeeLark/raw-adb path)', () => {
  it('getUIDump dumps then reads the XML', async () => {
    const c = new AdbClient({ exec: fakeExec([['cat /sdcard/engine-ui.xml', '<hierarchy/>']]) });
    expect(await c.getUIDump()).toBe('<hierarchy/>');
  });

  it('getCurrentPackage parses the foreground package', async () => {
    const c = new AdbClient({ exec: fakeExec([['mCurrentFocus', 'mCurrentFocus=Window{ab u0 com.instagram.android/com.instagram.MainActivity}']]) });
    expect(await c.getCurrentPackage()).toBe('com.instagram.android');
  });

  it('isAppInstalled matches an exact package line', async () => {
    const c = new AdbClient({ exec: fakeExec([['pm list packages com.discord', 'package:com.discord']]) });
    expect(await c.isAppInstalled('com.discord')).toBe(true);
    const absent = new AdbClient({ exec: fakeExec([['pm list packages com.x', '']]) });
    expect(await absent.isAppInstalled('com.x')).toBe(false);
  });

  it('startApp launches only when installed', async () => {
    const installed = new AdbClient({ exec: fakeExec([['pm list packages com.discord', 'package:com.discord']]) });
    expect(await installed.startApp('com.discord', 'com.discord/.Main')).toBe(true);
    const absent = new AdbClient({ exec: fakeExec([['pm list packages com.x', '']]) });
    expect(await absent.startApp('com.x')).toBe(false);
  });

  it('stopApp force-stops the package', async () => {
    let stopped = '';
    const c = new AdbClient({ exec: async (_b, args) => { const cmd = args.slice(1).join(' '); if (cmd.startsWith('am force-stop')) stopped = cmd; return { stdout: '', stderr: '' }; } });
    expect(await c.stopApp('com.discord')).toBe(true);
    expect(stopped).toContain('com.discord');
  });

  it('connect reports success from adb output', async () => {
    const c = new AdbClient({ exec: fakeExec([['connect 1.2.3.4:5555', 'connected to 1.2.3.4:5555']]) });
    expect(await c.connect('1.2.3.4:5555')).toBe(true);
  });
});
