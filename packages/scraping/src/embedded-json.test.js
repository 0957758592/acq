import { extractEmbeddedJson } from './embedded-json.js';

describe('extractEmbeddedJson (anon-http tier T1)', () => {
  test('extracts a SIGI_STATE blob', () => {
    const html = `<html><script>window['SIGI_STATE']={"user":{"id":"1"}};</script></html>`;
    expect(extractEmbeddedJson(html)).toEqual({ user: { id: '1' } });
  });

  test('extracts a __UNIVERSAL_DATA__ script blob', () => {
    const html =
      '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"a":1}</script>';
    expect(extractEmbeddedJson(html)).toEqual({ a: 1 });
  });

  test('extracts window._sharedData', () => {
    const html = `<script>window._sharedData = {"entry_data":{"x":2}};</script>`;
    expect(extractEmbeddedJson(html)).toEqual({ entry_data: { x: 2 } });
  });

  test('throws SCRAPE_TARGET_UNAVAILABLE when no embedded JSON is present', () => {
    try {
      extractEmbeddedJson('<html><body>nothing</body></html>');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('SCRAPE_TARGET_UNAVAILABLE');
    }
  });
});
