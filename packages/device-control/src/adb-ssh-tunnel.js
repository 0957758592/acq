import { spawn } from 'node:child_process';

import { DeviceControlError } from './errors.js';
import { delay } from './timing.js';

// ADB-over-SSH tunnel (TZ §5.3, channel 2) — bootstraps a local port-forward
// `ssh -L <localPort>:<remoteHost>:<remotePort>` so `adb connect 127.0.0.1:<localPort>`
// reaches a cloud device behind an SSH gateway (100-300ms latency vs asyncCmd
// polling). Key auth via `-i`, password via `sshpass` (never on argv otherwise).
// spawnImpl is injectable so the arg construction + lifecycle are unit-tested
// without opening a real connection. A missing config is a hard coded error.
export function buildSshArgs({ sshHost, sshPort = 22, sshUser, remoteHost = '127.0.0.1', remotePort, localPort }) {
  return [
    '-N',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=15',
    '-L', `${localPort}:${remoteHost}:${remotePort}`,
    '-p', String(sshPort),
    `${sshUser}@${sshHost}`
  ];
}

export function createAdbSshTunnel({
  sshHost,
  sshPort = 22,
  sshUser,
  sshKeyPath = null,
  sshPassword = null,
  remoteHost = '127.0.0.1',
  remotePort,
  localPort,
  spawnImpl = spawn,
  readyMs = 1500
} = {}) {
  if (!sshHost || !sshUser || !remotePort || !localPort) {
    throw new DeviceControlError('adb-ssh tunnel requires sshHost, sshUser, remotePort, localPort', { code: 'ADB_SSH_CONFIG' });
  }

  const forwardArgs = buildSshArgs({ sshHost, sshPort, sshUser, remoteHost, remotePort, localPort });
  let bin;
  let args;
  if (sshKeyPath) {
    bin = 'ssh';
    args = ['-i', sshKeyPath, ...forwardArgs];
  } else if (sshPassword) {
    bin = 'sshpass';
    args = ['-p', sshPassword, 'ssh', ...forwardArgs];
  } else {
    bin = 'ssh';
    args = forwardArgs;
  }

  const localAddress = `127.0.0.1:${localPort}`;
  let proc = null;

  return {
    localAddress,
    bin,
    args,
    async start() {
      proc = spawnImpl(bin, args, { stdio: 'ignore' });
      let failed = null;
      proc.on?.('error', (err) => { failed = err; });
      proc.on?.('exit', (code) => { if (code && code !== 0) failed = new Error(`ssh tunnel exited ${code}`); });
      await delay(readyMs); // give the forward time to establish
      if (failed) throw new DeviceControlError('adb-ssh tunnel failed to start', { code: 'ADB_SSH_TUNNEL_FAILED', cause: failed });
      return { localAddress, close: () => this.close() };
    },
    close() {
      try { proc?.kill?.('SIGTERM'); } catch { /* already gone */ }
      proc = null;
    }
  };
}
