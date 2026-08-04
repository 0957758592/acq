import { handleConnectionGone } from './rabbitmq.js';

describe('handleConnectionGone — let-it-crash on an unexpected broker drop (§16 failover)', () => {
  it('exits the process on an UNEXPECTED close so restart:on-failure reconnects', () => {
    const exits = [];
    const logs = [];
    const acted = handleConnectionGone({ intentional: false, event: 'close', exit: () => exits.push(1), log: (m) => logs.push(m) });
    expect(acted).toBe(true);
    expect(exits).toHaveLength(1); // process would exit → orchestrator restarts → reconnect at startup
    expect(logs[0]).toMatch(/rabbitmq/i);
  });

  it('exits on a connection error too', () => {
    let exited = 0;
    handleConnectionGone({ intentional: false, event: 'error', error: new Error('ECONNRESET'), exit: () => (exited += 1), log: () => {} });
    expect(exited).toBe(1);
  });

  it('does NOT exit on an intentional close (graceful shutdown)', () => {
    let exited = 0;
    const acted = handleConnectionGone({ intentional: true, event: 'close', exit: () => (exited += 1), log: () => {} });
    expect(acted).toBe(false);
    expect(exited).toBe(0);
  });
});
