import { DeviceControlError } from './errors.js';

export class RtcTransport {
  constructor({ name = 'rtc' } = {}) {
    this.name = name;
  }

  async connect() {
    throw new DeviceControlError(`${this.name} transport connect() is not implemented`, {
      code: 'RTC_TRANSPORT_NOT_IMPLEMENTED'
    });
  }

  async send() {
    throw new DeviceControlError(`${this.name} transport send() is not implemented`, {
      code: 'RTC_TRANSPORT_NOT_IMPLEMENTED'
    });
  }

  async close() {
    return undefined;
  }
}

export class DirectDeviceController {
  constructor({ transport }) {
    if (!transport) {
      throw new DeviceControlError('RTC transport is required', { code: 'RTC_TRANSPORT_CONFIG' });
    }
    this.transport = transport;
  }

  async tap(x, y) {
    return this.transport.send({ type: 'tap', x, y });
  }

  async swipe(startX, startY, endX, endY, durationMs = 400) {
    return this.transport.send({ type: 'swipe', startX, startY, endX, endY, durationMs });
  }

  async inputText(text) {
    return this.transport.send({ type: 'inputText', text: String(text || '') });
  }
}
