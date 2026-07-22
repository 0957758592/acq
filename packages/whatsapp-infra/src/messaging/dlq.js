// The DLQ consumer wrapper is generic and now lives in @acq/engine-infra
// (REQUIREM DRY — single implementation). Re-exported here for existing callers.
export { consumeJsonWithDlq } from '@acq/engine-infra';
