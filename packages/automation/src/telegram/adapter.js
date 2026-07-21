import { bringTelegramOnline, checkTelegramState, runTelegramAction } from './ui-flows.js';

// Maps ui-flow state -> health status vocabulary (engine STATE_TO_PROBE).
const STATUS_BY_STATE = {
  logged_in: 'active',
  banned: 'banned',
  checkpoint: 'cooldown',
  logged_out: 'cooldown'
};

export const telegramAdapter = {
  platform: 'telegram',

  // login = bring an acquired account online. Session-import is a guarded
  // verify-by-fact seam (throws TELEGRAM_SESSION_IMPORT_UNVERIFIED).
  login(controller, account, opts = {}) {
    return bringTelegramOnline(controller, { sessionRef: account?.secretRefs?.session, ...opts });
  },

  async healthCheck(controller, account, opts = {}) {
    const state = await checkTelegramState(controller, { actor: opts.actor });
    return {
      success: state === 'logged_in',
      status: STATUS_BY_STATE[state] || 'cooldown',
      state,
      reason: state
    };
  },

  // Generic action runner: join / dm / report / view (TZ §9.4).
  runAction(controller, action, account, opts = {}) {
    return runTelegramAction(controller, action, { actor: opts.actor, onEvent: opts.onEvent });
  }
};
