import {
  WHATSAPP_PACKAGE, WHATSAPP_LAUNCHER_ACTIVITY,
  WHATSAPP_HOME_TEXTS, WHATSAPP_CHAT_TEXTS, WHATSAPP_BAN_TEXTS,
  WHATSAPP_REPORT_TEXTS, WHATSAPP_DISMISS_TEXTS,
  WHATSAPP_REPORT_FALLBACK_POINT, WHATSAPP_OVERFLOW_FALLBACK_POINT,
  WHATSAPP_BLOCK_REPORT_TEXTS, WHATSAPP_REPORT_CONFIRM_TEXTS,
  WHATSAPP_OVERFLOW_RESOURCE_IDS, WHATSAPP_OVERFLOW_TEXTS
} from './constants.js';

describe('whatsapp constants', () => {
  it('identifies the app', () => {
    expect(WHATSAPP_PACKAGE).toBe('com.whatsapp');
    expect(typeof WHATSAPP_LAUNCHER_ACTIVITY).toBe('string');
  });
  it('exposes non-empty screen-signature arrays', () => {
    for (const arr of [
      WHATSAPP_HOME_TEXTS, WHATSAPP_CHAT_TEXTS, WHATSAPP_BAN_TEXTS, WHATSAPP_REPORT_TEXTS, WHATSAPP_DISMISS_TEXTS,
      WHATSAPP_BLOCK_REPORT_TEXTS, WHATSAPP_REPORT_CONFIRM_TEXTS, WHATSAPP_OVERFLOW_RESOURCE_IDS, WHATSAPP_OVERFLOW_TEXTS
    ]) {
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThan(0);
    }
  });
  it('exposes fallback coordinate points', () => {
    for (const p of [WHATSAPP_REPORT_FALLBACK_POINT, WHATSAPP_OVERFLOW_FALLBACK_POINT]) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
    }
  });
});
