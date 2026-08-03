import { browserProvidersViewModel } from './browser-providers.js';

describe('browserProvidersViewModel', () => {
  test('rows show backend/kind/configured/capabilities; marks the default', () => {
    const vm = browserProvidersViewModel({
      providers: [
        { provider: 'own', kind: 'self-hosted', configured: true, capabilities: { concurrency: 'host-bound' } },
        { provider: 'browserbase', kind: 'cloud', configured: false, capabilities: { concurrency: 'thousands' } }
      ],
      default: 'own'
    });
    expect(vm.total).toBe(2);
    expect(vm.default).toBe('own');
    expect(vm.rows[0]).toMatchObject({ provider: 'own', kind: 'self-hosted', configured: 'yes', isDefault: true });
    expect(vm.rows[1]).toMatchObject({ provider: 'browserbase', configured: 'no', isDefault: false });
  });
});
