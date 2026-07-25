// Unit of Work / explicit transaction boundaries (REQUIREM §2.5, TZ §12.3).
// Wraps a multi-write use-case in a Mongo session transaction so a cascade
// either fully commits or fully aborts.
//
// Deployment-honest: transactions need a replica set. On a standalone server
// (dev/CI) Mongo rejects them — we then run the work WITHOUT a transaction and
// report `transactional:false`, instead of crashing or silently pretending the
// writes were atomic.
const NON_TRANSACTIONAL = /Transaction numbers are only allowed|replica set|not supported|IllegalOperation/i;

export function createUnitOfWork({ connection, logger = null } = {}) {
  if (!connection?.startSession) throw new Error('createUnitOfWork requires a mongoose connection');

  return {
    async withTransaction(fn) {
      let session;
      try {
        session = await connection.startSession();
      } catch {
        return { result: await fn(null), transactional: false };
      }
      try {
        let result;
        await session.withTransaction(async () => {
          result = await fn(session);
        });
        return { result, transactional: true };
      } catch (err) {
        if (NON_TRANSACTIONAL.test(err?.message ?? '')) {
          logger?.warn?.('transactions unavailable (standalone mongo) — running without', { reason: err.message });
          return { result: await fn(null), transactional: false };
        }
        throw err;
      } finally {
        await session.endSession().catch(() => {});
      }
    }
  };
}
