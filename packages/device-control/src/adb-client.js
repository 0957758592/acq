import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { DeviceControlError } from './errors.js';
import { delay } from './timing.js';

const execFileAsync = promisify(execFile);

function buildAdbArgs(serial, args = []) {
  return serial ? ['-s', serial, ...args] : args;
}

export class AdbClient {
  constructor({ adbPath = 'adb', serial = '' } = {}) {
    this.adbPath = adbPath;
    this.serial = serial;
  }

  withSerial(serial) {
    return new AdbClient({ adbPath: this.adbPath, serial });
  }

  async run(args = [], { timeoutMs = 30_000 } = {}) {
    try {
      const { stdout, stderr } = await execFileAsync(this.adbPath, buildAdbArgs(this.serial, args), {
        timeout: timeoutMs
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
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

  async tap(x, y) {
    return this.shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  async swipe(startX, startY, endX, endY, durationMs = 400) {
    return this.shell(
      `input swipe ${Math.round(startX)} ${Math.round(startY)} ${Math.round(endX)} ${Math.round(
        endY
      )} ${Math.round(durationMs)}`
    );
  }

  async inputText(text) {
    const escaped = String(text || '').replace(/ /g, '%s').replace(/'/g, "\\'");
    return this.shell(`input text '${escaped}'`);
  }

  async keyevent(keyCode) {
    return this.shell(`input keyevent ${keyCode}`);
  }

  async waitForDevice(timeoutMs = 60_000) {
    await this.run(['wait-for-device'], { timeoutMs });
    await delay(500);
    return true;
  }

  async screenshot(remotePath = '/sdcard/engine-screen.png') {
    await this.shell(`screencap -p ${remotePath}`);
    return remotePath;
  }
}
