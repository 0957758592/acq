// SecretResolver adapter backed by process env vars and the macOS keychain.
//
// Refs are `scheme:name`: `env:FOO` reads an environment variable, and
// `keychain:wa-a1` reads a generic password from the login keychain.
//
// NOTE: the keychain scheme is macOS/dev-only — it shells out to the `security`
// CLI. Production deployments use `env:` refs (secrets injected by the runtime);
// keychain refs are a developer convenience for running against real accounts
// locally.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { domainError } from '@acq/whatsapp';

const execFileAsync = promisify(execFile);

// Default production reader: `security find-generic-password -a $USER -s <name> -w`.
async function readMacOSKeychain(name) {
  const args = ['find-generic-password', '-a', process.env.USER || '', '-s', name, '-w'];
  const { stdout } = await execFileAsync('security', args, { encoding: 'utf8' });
  return stdout.trim();
}

export function createKeychainEnvSecretResolver({ env = process.env, readKeychain = readMacOSKeychain } = {}) {
  return {
    async resolve(ref) {
      const value = String(ref ?? '');
      const separatorIndex = value.indexOf(':');
      const scheme = separatorIndex > 0 ? value.slice(0, separatorIndex) : '';
      const name = separatorIndex > 0 ? value.slice(separatorIndex + 1) : '';

      if (scheme === 'env') {
        const resolved = env[name];
        if (resolved === undefined) {
          throw domainError('SECRET_NOT_FOUND', `env var "${name}" is not set`);
        }
        return resolved;
      }

      if (scheme === 'keychain') {
        return readKeychain(name);
      }

      throw domainError('SECRET_SCHEME_UNSUPPORTED', `unsupported secret reference "${value}"`);
    }
  };
}
