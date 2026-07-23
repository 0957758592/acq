import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { DeviceControlError } from './errors.js';
import { delay } from './timing.js';

const execFileAsync = promisify(execFile);

function buildAdbArgs(serial, args = []) {
  return serial ? ['-s', serial, ...args] : args;
}

export class AdbClient {
  // `exec` is injectable so the full Controller surface is unit-testable without
  // a real adb binary/device.
  constructor({ adbPath = 'adb', serial = '', exec = execFileAsync } = {}) {
    this.adbPath = adbPath;
    this.serial = serial;
    this.exec = exec;
  }

  withSerial(serial) {
    return new AdbClient({ adbPath: this.adbPath, serial, exec: this.exec });
  }

  async run(args = [], { timeoutMs = 30_000 } = {}) {
    try {
      const { stdout, stderr } = await this.exec(this.adbPath, buildAdbArgs(this.serial, args), { timeout: timeoutMs });
      return { stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() };
    } catch (error) {
      throw new DeviceControlError('ADB command failed', {
        code: 'ADB_COMMAND_FAILED',
        cause: error,
        details: { args, serial: this.serial }
      });
    }
  }

  async shell(command, options = {}) {
    return this.run(['shell', command], options);
  }

  async connect(address = this.serial) {
    const { stdout } = await this.run(['connect', address]);
    return /connected|already connected/i.test(stdout);
  }

  async disconnect(address = this.serial) {
    return this.run(['disconnect', address]);
  }

  async tap(x, y) {
    return this.shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  async swipe(startX, startY, endX, endY, durationMs = 400) {
    return this.shell(
      `input swipe ${Math.round(startX)} ${Math.round(startY)} ${Math.round(endX)} ${Math.round(endY)} ${Math.round(durationMs)}`
    );
  }

  async inputText(text) {
    const escaped = String(text || '').replace(/ /g, '%s').replace(/'/g, "\\'");
    return this.shell(`input text '${escaped}'`);
  }

  async keyevent(keyCode) {
    return this.shell(`input keyevent ${keyCode}`);
  }

  async enter() {
    return this.keyevent(66); // KEYCODE_ENTER
  }

  async clearField() {
    // Move to end then delete a bounded run of chars (no unbounded loop).
    await this.keyevent(123); // KEYCODE_MOVE_END
    return this.shell('input keyevent $(for i in $(seq 1 60); do echo 67; done)').catch(() => this.keyevent(67));
  }

  async waitForDevice(timeoutMs = 60_000) {
    await this.run(['wait-for-device'], { timeoutMs });
    await delay(500);
    return true;
  }

  // ── Controller UI surface (TZ §5.2) — GeeLark & raw-ADB device paths ──
  async getUIDump() {
    await this.shell('uiautomator dump /sdcard/engine-ui.xml').catch(() => '');
    const { stdout } = await this.shell('cat /sdcard/engine-ui.xml');
    return stdout;
  }

  async getCurrentPackage() {
    const { stdout } = await this.shell('dumpsys window 2>/dev/null | grep -E "mCurrentFocus|mFocusedApp"').catch(() => ({ stdout: '' }));
    return stdout.match(/\s([a-z0-9._]+)\/[a-zA-Z0-9._]+/i)?.[1] || '';
  }

  async isAppInstalled(packageName) {
    if (!packageName) return false;
    const { stdout } = await this.shell(`pm list packages ${packageName}`);
    return stdout.split('\n').some((line) => line.trim() === `package:${packageName}`);
  }

  async startApp(packageName, activity = '') {
    if (!(await this.isAppInstalled(packageName))) return false;
    if (activity) await this.shell(`am start -n ${activity}`);
    else await this.shell(`monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
    return true;
  }

  async stopApp(packageName) {
    if (!packageName) return false;
    await this.shell(`am force-stop ${packageName}`);
    return true;
  }

  async screenshot(remotePath = '/sdcard/engine-screen.png') {
    await this.shell(`screencap -p ${remotePath}`);
    return remotePath;
  }
}
