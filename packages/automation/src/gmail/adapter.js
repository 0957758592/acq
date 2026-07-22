import { checkGmailState, readVerificationCode } from './ui-flows.js';

const STATUS_BY_STATE = {
  logged_in: 'active',
  banned: 'banned',
  checkpoint: 'cooldown',
  logged_out: 'cooldown'
};

// Gmail driver: the signup anchor + verification-code reader (TZ §7.2). It has
// no social actions; runAction supports only 'read-code'.
export const gmailAdapter = {
  platform: 'gmail',

  async healthCheck(controller, account, opts = {}) {
    const state = await checkGmailState(controller, { actor: opts.actor });
    return { success: state === 'logged_in', status: STATUS_BY_STATE[state] || 'cooldown', state, reason: state };
  },

  async runAction(controller, action, account, opts = {}) {
    if (action?.type !== 'read-code') {
      const err = new Error(`ACTION_TYPE_UNSUPPORTED: gmail does not support action '${action?.type}'`);
      err.code = 'ACTION_TYPE_UNSUPPORTED';
      throw err;
    }
    const code = await readVerificationCode(controller, opts);
    return { ok: true, code };
  }
};
