// On-device selector overrides (TZ §9.4). Built-in per-platform selector seeds
// are UNIONED with operator-supplied overrides (`opts.selectors`) at call time,
// so a live app build can be tuned WITHOUT editing driver code — the overrides
// are the verify-by-fact input, supplied/managed via the device.selectors.* ops.
// Union (never replace) keeps the seeds working while adding build-specific text.
export function unionTexts(base = [], extra = []) {
  return [...new Set([...(base || []), ...(extra || [])])];
}

// Merge a per-action selector config ({triggerTexts, confirmTexts}) with an
// override of the same shape.
export function mergeActionConfig(config = {}, override = {}) {
  return {
    ...config,
    triggerTexts: unionTexts(config.triggerTexts, override.triggerTexts),
    confirmTexts: unionTexts(config.confirmTexts, override.confirmTexts)
  };
}
