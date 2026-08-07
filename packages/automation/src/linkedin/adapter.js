import { buildLoginRunner } from '../shared/login-runner.js';

import { checkLinkedinState, runLinkedinAction } from './ui-flows.js';
import {
  LINKEDIN_PACKAGE,
  LINKEDIN_LAUNCHER_ACTIVITY,
  LINKEDIN_HOME_TEXTS,
  LINKEDIN_LOGIN_TEXTS,
  LINKEDIN_PRELOGIN_TAP_TEXTS,
  LINKEDIN_BAN_TEXTS,
  LINKEDIN_CHECKPOINT_TEXTS,
  LINKEDIN_USERNAME_HINTS,
  LINKEDIN_PASSWORD_HINTS,
  LINKEDIN_SUBMIT_TEXTS,
  LINKEDIN_SUBMIT_KEYEVENT
} from './constants.js';

const STATUS_BY_STATE = {
  logged_in: 'active',
  banned: 'banned',
  checkpoint: 'cooldown',
  logged_out: 'cooldown'
};

export const linkedinAdapter = {
  platform: 'linkedin',

  // LinkedIn online = credential login (email/phone + password). Selectors are
  // verify-by-fact seeds; the login-runner enters creds and confirms on-device.
  login: buildLoginRunner({
    platform: 'linkedin',
    appPackage: LINKEDIN_PACKAGE,
    launcherActivity: LINKEDIN_LAUNCHER_ACTIVITY,
    homeTexts: LINKEDIN_HOME_TEXTS,
    loginTexts: LINKEDIN_LOGIN_TEXTS,
    preLoginTapTexts: LINKEDIN_PRELOGIN_TAP_TEXTS,
    banTexts: LINKEDIN_BAN_TEXTS,
    checkpointTexts: LINKEDIN_CHECKPOINT_TEXTS,
    usernameHints: LINKEDIN_USERNAME_HINTS,
    passwordHints: LINKEDIN_PASSWORD_HINTS,
    submitTexts: LINKEDIN_SUBMIT_TEXTS,
    submitKeyevent: LINKEDIN_SUBMIT_KEYEVENT,
    // LinkedIn's prereg->form transition + post-login are slow; give screens time
    // to settle before reading/typing (verify-by-fact timing on the live app).
    settleMs: 5000
  }),

  async healthCheck(controller, account, opts = {}) {
    const state = await checkLinkedinState(controller, { actor: opts.actor });
    return { success: state === 'logged_in', status: STATUS_BY_STATE[state] || 'cooldown', state, reason: state };
  },

  runAction(controller, action, account, opts = {}) {
    return runLinkedinAction(controller, action, { actor: opts.actor, onEvent: opts.onEvent });
  }
};
