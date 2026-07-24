import { createTelegramWebSelectors, createBrowserSelectorRegistry } from './telegram-web-selectors.js';

describe('createTelegramWebSelectors', () => {
  it('resolveUrl opens the chat on web.telegram.org (strips a leading @)', () => {
    const sel = createTelegramWebSelectors();
    expect(sel.resolveUrl({ target: '@durov' })).toBe('https://web.telegram.org/k/#durov');
    expect(sel.resolveUrl({ target: 'mygroup' })).toBe('https://web.telegram.org/k/#mygroup');
  });

  it('honors a custom baseUrl override (no hardcode)', () => {
    const sel = createTelegramWebSelectors({ baseUrl: 'https://web.telegram.org/a/#' });
    expect(sel.resolveUrl({ target: 'g' })).toBe('https://web.telegram.org/a/#g');
  });

  it('exposes a serializable in-page extractItems function whose source embeds the (overridable) selectors', () => {
    const sel = createTelegramWebSelectors({ message: { node: '.my-msg' } });
    expect(typeof sel.extractItems).toBe('function');
    // new Function → closure-free; the resolved selector is embedded in the source
    expect(sel.extractItems.toString()).toContain('.my-msg');
  });
});

describe('createBrowserSelectorRegistry', () => {
  it('serves only the wired platforms; others are the unverified seam (null)', () => {
    const reg = createBrowserSelectorRegistry({ telegram: createTelegramWebSelectors() });
    expect(typeof reg.forPlatform('telegram').resolveUrl).toBe('function');
    expect(reg.forPlatform('instagram')).toBeNull();
  });
});
