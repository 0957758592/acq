import { runConfirmedAction, ConfirmedActionError } from './confirmed-action.js';

// Builds a driver `runAction(controller, action, account, opts)` from a
// per-platform selector config (TZ §9.4). Dispatches action.type -> its
// {triggerTexts, confirmTexts} through the shared confirm-by-fact runner (§9.5);
// `special` handlers cover non-tap actions (e.g. publish). One control-flow,
// many platforms — selector text sets are verify-by-fact seeds passed in.
// An unsupported action is an honest coded seam, never a fake success.
export function buildActionRunner({ platform, banTexts = [], checkpointTexts = [], dismissTexts = [], actions = {}, special = {} } = {}) {
  return async function runAction(controller, action, account, opts = {}) {
    const type = action?.type;
    if (typeof special[type] === 'function') {
      return special[type](controller, action, account, opts);
    }
    const config = actions[type];
    if (!config) {
      throw new ConfirmedActionError('ACTION_TYPE_UNSUPPORTED', `${platform} does not support action '${type}'`);
    }
    return runConfirmedAction(controller, {
      banTexts,
      checkpointTexts,
      dismissTexts,
      triggerTexts: config.triggerTexts,
      confirmTexts: config.confirmTexts,
      actor: opts.actor
    });
  };
}
