import { createMongoAccountRepo, createMongoActionTaskRepo } from '@acq/engine-infra';
import { reconcile } from '@acq/engine-domain';
import { getPlatformCapabilities, listPlatforms } from '@acq/platform-registry';
import { EngineAccount } from '@acq/core/models/engine-account';
import { getRedis } from '@acq/core/db/redis';
import { createStructuredLogger } from '@acq/logger';

/**
 * Generic engine composition root (TZ §2.3/§8). Pure wiring — no I/O at import.
 * Parameterized by the set of active platforms (from @acq/platform-registry).
 * Every dependency is injectable via `deps` so the whole graph can be faked.
 */
export function buildEngineContext({ env = {}, deps = {} } = {}) {
  const D = {
    createMongoAccountRepo,
    createMongoActionTaskRepo,
    reconcile,
    getPlatformCapabilities,
    listPlatforms,
    EngineAccount,
    getRedis,
    createStructuredLogger,
    clock: { now: () => new Date() },
    ...deps
  };

  const logger = D.createStructuredLogger({ level: env.logLevel || 'info', base: { service: 'engine' } });
  const accountRepo = D.createMongoAccountRepo({ model: D.EngineAccount });
  const actionTaskRepo = D.actionTaskModel
    ? D.createMongoActionTaskRepo({ model: D.actionTaskModel })
    : null;

  const activePlatforms = (env.platforms && env.platforms.length ? env.platforms : D.listPlatforms())
    .filter((p) => {
      try {
        D.getPlatformCapabilities(p);
        return true;
      } catch {
        return false;
      }
    });

  return {
    logger,
    clock: D.clock,
    accountRepo,
    actionTaskRepo,
    reconcile: D.reconcile,
    capabilitiesOf: D.getPlatformCapabilities,
    activePlatforms,
    config: {
      poolThreshold: env.poolThreshold ?? 10,
      buyBatchSize: env.buyBatchSize ?? 5,
      autobuyEnabled: Boolean(env.autobuyEnabled)
    },
    owner: `engine:${env.pid ?? 'local'}`
  };
}
