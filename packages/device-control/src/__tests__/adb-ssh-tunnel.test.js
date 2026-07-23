import { createAdbSshTunnel, buildSshArgs } from '../adb-ssh-tunnel.js';

function fakeProc({ exitCode = null, error = null } = {}) {
  const handlers = {};
  const proc = {
    killed: false,
    on: (ev, cb) => { handlers[ev] = cb; return proc; },
    kill: () => { proc.killed = true; }
  };
  // fire async
  if (error) queueMicrotask(() => handlers.error?.(error));
  if (exitCode) queueMicrotask(() => handlers.exit?.(exitCode));
  return proc;
}

describe('createAdbSshTunnel (§5.3 adb-over-ssh)', () => {
  it('builds a correct -L port forward', () => {
    const args = buildSshArgs({ sshHost: 'gw', sshUser: 'root', remotePort: 5555, localPort: 6000 });
    expect(args).toContain('-L');
    expect(args).toContain('6000:127.0.0.1:5555');
    expect(args).toContain('root@gw');
  });

  it('uses ssh -i for key auth', () => {
    const t = createAdbSshTunnel({ sshHost: 'gw', sshUser: 'u', remotePort: 5555, localPort: 6000, sshKeyPath: '/k' });
    expect(t.bin).toBe('ssh');
    expect(t.args.slice(0, 2)).toEqual(['-i', '/k']);
  });

  it('uses sshpass for password auth (never ssh -p<pw>)', () => {
    const t = createAdbSshTunnel({ sshHost: 'gw', sshUser: 'u', remotePort: 5555, localPort: 6000, sshPassword: 'secret' });
    expect(t.bin).toBe('sshpass');
    expect(t.args.slice(0, 3)).toEqual(['-p', 'secret', 'ssh']);
  });

  it('starts the tunnel and returns a local address + close handle', async () => {
    let spawned = null;
    const t = createAdbSshTunnel({ sshHost: 'gw', sshUser: 'u', remotePort: 5555, localPort: 6000, readyMs: 0, spawnImpl: (bin, args) => { spawned = { bin, args }; return fakeProc(); } });
    const handle = await t.start();
    expect(handle.localAddress).toBe('127.0.0.1:6000');
    expect(spawned.bin).toBe('ssh');
    handle.close();
  });

  it('fails safe (coded) when ssh exits with an error', async () => {
    const t = createAdbSshTunnel({ sshHost: 'gw', sshUser: 'u', remotePort: 5555, localPort: 6000, readyMs: 5, spawnImpl: () => fakeProc({ exitCode: 255 }) });
    await expect(t.start()).rejects.toMatchObject({ code: 'ADB_SSH_TUNNEL_FAILED' });
  });

  it('requires the mandatory config', () => {
    let code = null;
    try { createAdbSshTunnel({ sshHost: 'gw' }); } catch (e) { code = e.code; }
    expect(code).toBe('ADB_SSH_CONFIG');
  });
});
