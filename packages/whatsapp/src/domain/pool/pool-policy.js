// WhatsApp reuses the generic pool-replenish policy (TZ §3.4). Single
// implementation lives in @acq/engine-domain — no duplication (REQUIREM DRY).
export { needsReplenish, buyQuantity } from '@acq/engine-domain';
