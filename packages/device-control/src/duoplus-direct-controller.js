import { DeviceControlError } from './errors.js';
import { delay } from './timing.js';

function commandPayload(response = {}, imageId = '') {
  const data = response.data || {};
  if (data[imageId]) return data[imageId];
  return data;
}

function assertCommandOk(result = {}, command = '') {
  if (result.success === false) {
    throw new DeviceControlError('DuoPlus command failed', {
      code: 'DUOPLUS_COMMAND_FAILED',
      details: { command, message: result.message || '' }
    });
  }
  return String(result.content || '').trim();
}

function shellEscape(value) {
  return String(value || '').replace(/'/g, "'\\''");
}

function sleepCommand(ms = 0) {
  const seconds = Math.max(0, Number(ms || 0) / 1000);
  return `sleep ${seconds.toFixed(3)}`;
}

function amStartSucceeded(output = '') {
  const text = String(output || '').toLowerCase();
  if (!text.trim()) return false;
  if (text.includes('error:') || text.includes('exception') || text.includes('does not exist')) return false;
  return text.includes('status: ok') || text.includes('complete');
}

function resolveComponentFromOutput(output = '', packageName = '') {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.reverse().find((line) => line.includes('/') && (!packageName || line.startsWith(`${packageName}/`))) || ''
  );
}

export class DuoplusDirectController {
  constructor({ client, imageId, shellTimeoutMs = 10_000, pollIntervalMs = 750 } = {}) {
    if (!client) throw new DeviceControlError('DuoPlus client is required', { code: 'DUOPLUS_DIRECT_CONFIG' });
    if (!imageId) throw new DeviceControlError('DuoPlus imageId is required', { code: 'DUOPLUS_DIRECT_CONFIG' });
    this.client = client;
    this.imageId = imageId;
    this.shellTimeoutMs = shellTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
  }

  connect() {
    return Promise.resolve(true);
  }

  disconnect() {
    return Promise.resolve();
  }

  waitForDevice() {
    return Promise.resolve(true);
  }

  async shell(command) {
    const response = await this.client.executeCommand(this.imageId, command);
    return assertCommandOk(commandPayload(response, this.imageId), command);
  }

  tap(x, y) {
    return this.shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  swipe(startX, startY, endX, endY, durationMs = 350) {
    return this.shell(
      `input swipe ${Math.round(startX)} ${Math.round(startY)} ${Math.round(endX)} ${Math.round(endY)} ${Math.round(
        durationMs
      )}`
    );
  }

  inputText(text) {
    return this.shell(`input text ${String(text || '').replace(/\s/g, '%s')}`);
  }

  type(text) {
    return this.inputText(text);
  }

  keyevent(keyCode) {
    return this.shell(`input keyevent ${Number(keyCode)}`);
  }

  keyEvent(keyCode) {
    return this.keyevent(keyCode);
  }

  enter() {
    return this.keyevent(66);
  }

  async getUIDump() {
    await this.shell('DuoPlusDumpUI /sdcard/uidump.xml').catch(() => '');
    await delay(this.pollIntervalMs);
    return this.shell('cat /sdcard/uidump.xml').catch(() => '');
  }

  async getCurrentPackage() {
    const output = await this.shell('dumpsys window 2>/dev/null | grep mCurrentFocus').catch(() => '');
    return output.match(/\s([a-z0-9._]+)\/[a-zA-Z0-9._]+/i)?.[1] || '';
  }

  async screenshot() {
    const content = await this.shell('screencap -p | base64').catch(() => '');
    const base64 = String(content || '').replace(/\s+/g, '');
    return base64 ? `data:image/png;base64,${base64}` : '';
  }

  longPress(x, y, durationMs = 800) {
    return this.swipe(x, y, x, y, durationMs);
  }

  typeHuman(value, options = {}) {
    if (Array.isArray(value)) return this.typeSequence(value, options);
    if (Array.isArray(options.steps)) return this.typeSequence(options.steps, options);
    return this.inputText(value);
  }

  gestureSwipe(points = []) {
    if (!Array.isArray(points) || points.length < 2) return Promise.resolve('');
    const commands = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const durationMs = Math.max(16, Math.round(Number(end.durationMs || 40)));
      commands.push(
        `input swipe ${Math.round(start.x)} ${Math.round(start.y)} ${Math.round(end.x)} ${Math.round(end.y)} ${durationMs}`
      );
      commands.push(sleepCommand(Math.min(durationMs * 0.35, 80)));
    }
    return this.shell(commands.join('; '));
  }

  typeSequence(steps = []) {
    if (!Array.isArray(steps) || !steps.length) return Promise.resolve('');
    const commands = steps
      .map((step) => {
        if (step.type === 'text' && step.value) return `input text ${String(step.value).replace(/\s/g, '%s')}`;
        if (step.type === 'key' && step.code) return `input keyevent ${Number(step.code)}`;
        if (step.type === 'sleep') return sleepCommand(step.ms);
        return '';
      })
      .filter(Boolean);
    if (!commands.length) return Promise.resolve('');
    return this.shell(commands.join('; '));
  }

  clearField(times = 30) {
    return this.shell(Array.from({ length: times }, () => 'input keyevent 67').join('; '));
  }

  async isAppInstalled(packageName) {
    const output = await this.shell(`pm path ${shellEscape(packageName)}`).catch(() => '');
    return String(output || '').includes('package:');
  }

  async resolveLauncherComponent(packageName) {
    const output = await this.shell(
      `cmd package resolve-activity --brief -c android.intent.category.LAUNCHER ${shellEscape(packageName)}`
    ).catch(() => '');
    return resolveComponentFromOutput(output, packageName);
  }

  async waitForForeground(packageName, timeoutMs = 10_000) {
    const deadline = Date.now() + Number(timeoutMs || 10_000);
    while (Date.now() < deadline) {
      const currentPackage = await this.getCurrentPackage();
      if (currentPackage === packageName) return true;
      await delay(Math.min(this.pollIntervalMs, 750));
    }
    return false;
  }

  async startApp(packageName, activity = '') {
    const packageValue = String(packageName || '').trim();
    if (!packageValue) return false;
    if (!(await this.isAppInstalled(packageValue))) return false;

    const launchComponents = [];
    if (activity) {
      launchComponents.push(activity.includes('/') ? activity : `${packageValue}/${activity}`);
    }
    const resolvedComponent = await this.resolveLauncherComponent(packageValue);
    if (resolvedComponent && !launchComponents.includes(resolvedComponent)) launchComponents.push(resolvedComponent);

    for (const component of launchComponents) {
      const output = await this.shell(`am start -W -n ${component}`).catch(() => '');
      if (amStartSucceeded(output) && (await this.waitForForeground(packageValue))) return true;
    }

    await this.shell(`monkey -p ${shellEscape(packageValue)} -c android.intent.category.LAUNCHER 1`).catch(() => '');
    return this.waitForForeground(packageValue);
  }

  stopApp(packageName) {
    return this.shell(`am force-stop ${shellEscape(packageName)}`);
  }

  cleanAppHome(packageName) {
    return this.shell(`pm clear ${shellEscape(packageName)}`);
  }

  pushFile() {
    throw new DeviceControlError('pushFile is unavailable on DuoPlus direct controller', {
      code: 'DUOPLUS_DIRECT_PUSH_UNAVAILABLE'
    });
  }
}
