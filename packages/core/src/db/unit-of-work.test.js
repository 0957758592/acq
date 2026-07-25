import { createUnitOfWork } from './unit-of-work.js';

function fakeConnection({ startFails = false, withTransactionError = null } = {}) {
  const log = [];
  return {
    log,
    startSession: async () => {
      if (startFails) throw new Error('no sessions');
      return {
        withTransaction: async (fn) => {
          log.push('begin');
          if (withTransactionError) { log.push('abort'); throw withTransactionError; }
          await fn();
          log.push('commit');
        },
        endSession: async () => { log.push('end'); }
      };
    }
  };
}

describe('createUnitOfWork (REQUIREM §2.5 transaction boundaries)', () => {
  it('commits a multi-write unit inside one transaction and passes the session down', async () => {
    const conn = fakeConnection();
    const uow = createUnitOfWork({ connection: conn });
    const seen = [];
    const { result, transactional } = await uow.withTransaction(async (session) => { seen.push(session); return 'done'; });
    expect(result).toBe('done');
    expect(transactional).toBe(true);
    expect(seen[0]).toBeTruthy(); // the writer got a session to enlist in
    expect(conn.log).toEqual(['begin', 'commit', 'end']);
  });

  it('propagates a real failure (transaction aborted, nothing half-committed)', async () => {
    const boom = new Error('write conflict');
    const conn = fakeConnection({ withTransactionError: boom });
    const uow = createUnitOfWork({ connection: conn });
    await expect(uow.withTransaction(async () => 'x')).rejects.toThrow('write conflict');
    expect(conn.log).toEqual(['begin', 'abort', 'end']);
  });

  it('degrades honestly on a standalone server (no replica set): runs the work, reports transactional:false', async () => {
    const conn = fakeConnection({ withTransactionError: new Error('Transaction numbers are only allowed on a replica set member or mongos') });
    const uow = createUnitOfWork({ connection: conn, logger: { warn: () => {} } });
    const { result, transactional } = await uow.withTransaction(async (session) => { expect(session).toBeNull(); return 'ran'; });
    expect(result).toBe('ran');
    expect(transactional).toBe(false);
  });

  it('degrades when sessions are unavailable entirely', async () => {
    const uow = createUnitOfWork({ connection: fakeConnection({ startFails: true }) });
    expect(await uow.withTransaction(async () => 'ok')).toEqual({ result: 'ok', transactional: false });
  });
});
