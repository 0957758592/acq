import { createKeychainEnvSecretResolver } from './keychain-env-secret-resolver.js';

describe('KeychainEnvSecretResolver', () => {
  it('resolves env: refs from the injected env', async () => {
    const resolver = createKeychainEnvSecretResolver({ env: { FOO: 'bar' } });
    await expect(resolver.resolve('env:FOO')).resolves.toBe('bar');
  });

  it('throws SECRET_NOT_FOUND when the env var is missing', async () => {
    const resolver = createKeychainEnvSecretResolver({ env: {} });
    await expect(resolver.resolve('env:FOO')).rejects.toThrow('SECRET_NOT_FOUND');
  });

  it('resolves keychain: refs via the injected reader', async () => {
    const calls = [];
    const readKeychain = async (name) => { calls.push(name); return 'secret-value'; };
    const resolver = createKeychainEnvSecretResolver({ env: {}, readKeychain });
    await expect(resolver.resolve('keychain:wa-a1')).resolves.toBe('secret-value');
    expect(calls).toEqual(['wa-a1']);
  });

  it('throws SECRET_SCHEME_UNSUPPORTED for an unknown scheme', async () => {
    const resolver = createKeychainEnvSecretResolver({ env: {} });
    await expect(resolver.resolve('foo:bar')).rejects.toThrow('SECRET_SCHEME_UNSUPPORTED');
  });

  it('throws SECRET_SCHEME_UNSUPPORTED for a ref with no scheme', async () => {
    const resolver = createKeychainEnvSecretResolver({ env: {} });
    await expect(resolver.resolve('bar')).rejects.toThrow('SECRET_SCHEME_UNSUPPORTED');
  });
});
