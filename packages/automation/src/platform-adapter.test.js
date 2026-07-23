import { getPlatformAdapter } from './platform-adapter.js';

test('returns platform adapters for Instagram, TikTok, and YouTube', () => {
  for (const platform of ['instagram', 'tiktok', 'youtube']) {
    const adapter = getPlatformAdapter(platform);

    expect(adapter.platform).toBe(platform);
    expect(typeof adapter.login).toBe('function');
    expect(typeof adapter.setupProfile).toBe('function');
    expect(typeof adapter.healthCheck).toBe('function');
    // Generic §9.4 action contract: every driver exposes runAction (which handles
    // publish + follow/like/comment) reachable through the generic engine.
    expect(typeof adapter.runAction).toBe('function');
  }
});

test('throws for unsupported platform adapters', () => {
  expect(() => getPlatformAdapter('reddit')).toThrow(/Unsupported platform adapter/);
});
