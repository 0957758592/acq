import { checkFacebookState, runFacebookAction } from './ui-flows.js';

const STATUS_BY_STATE = {
  logged_in: 'active',
  banned: 'banned',
  checkpoint: 'cooldown',
  logged_out: 'cooldown'
};

export const facebookAdapter = {
  platform: 'facebook',

  async healthCheck(controller, account, opts = {}) {
    const state = await checkFacebookState(controller, { actor: opts.actor });
    return { success: state === 'logged_in', status: STATUS_BY_STATE[state] || 'cooldown', state, reason: state };
  },

  runAction(controller, action, account, opts = {}) {
    return runFacebookAction(controller, action, { actor: opts.actor, onEvent: opts.onEvent });
  }
};
