import { buildLoginRunner } from '../shared/login-runner.js';

import { checkGmailState, readVerificationCode } from './ui-flows.js';
import {
  GMAIL_PACKAGE,
  GMAIL_LAUNCHER_ACTIVITY,
  GMAIL_HOME_TEXTS,
  GMAIL_LOGIN_TEXTS,
  GMAIL_BAN_TEXTS,
  GMAIL_CHECKPOINT_TEXTS
} from './constants.js';

const STATUS_BY_STATE = {
  logged_in: 'active',
  banned: 'banned',
  checkpoint: 'cooldown',
  logged_out: 'cooldown'
};

// Gmail driver: the signup anchor + verification-code reader (TZ §7.2) + Google
// account login. runAction supports only 'read-code' (no social actions).
export const gmailAdapter = {
  platform: 'gmail',

  // Gmail online = Google account sign-in (TZ §9.4). Selectors are verify-by-fact.
  login: buildLoginRunner({
    platform: 'gmail',
    appPackage: GMAIL_PACKAGE,
    launcherActivity: GMAIL_LAUNCHER_ACTIVITY,
    homeTexts: GMAIL_HOME_TEXTS,
    loginTexts: GMAIL_LOGIN_TEXTS,
    banTexts: GMAIL_BAN_TEXTS,
    checkpointTexts: GMAIL_CHECKPOINT_TEXTS,
    usernameHints: ['Email or phone', 'Enter your email'],
    passwordHints: ['Enter your password', 'Password'],
    submitTexts: ['Next']
  }),

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
