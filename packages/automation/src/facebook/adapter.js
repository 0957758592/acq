import { buildLoginRunner } from '../shared/login-runner.js';

import { checkFacebookState, runFacebookAction } from './ui-flows.js';
import {
  FACEBOOK_PACKAGE,
  FACEBOOK_LAUNCHER_ACTIVITY,
  FACEBOOK_HOME_TEXTS,
  FACEBOOK_LOGIN_TEXTS,
  FACEBOOK_BAN_TEXTS,
  FACEBOOK_CHECKPOINT_TEXTS
} from './constants.js';

const STATUS_BY_STATE = {
  logged_in: 'active',
  banned: 'banned',
  checkpoint: 'cooldown',
  logged_out: 'cooldown'
};

export const facebookAdapter = {
  platform: 'facebook',

  // Facebook online = credential login (TZ §9.4). Selectors are verify-by-fact.
  login: buildLoginRunner({
    platform: 'facebook',
    appPackage: FACEBOOK_PACKAGE,
    launcherActivity: FACEBOOK_LAUNCHER_ACTIVITY,
    homeTexts: FACEBOOK_HOME_TEXTS,
    loginTexts: FACEBOOK_LOGIN_TEXTS,
    banTexts: FACEBOOK_BAN_TEXTS,
    checkpointTexts: FACEBOOK_CHECKPOINT_TEXTS,
    usernameHints: ['Mobile number or email', 'Email or phone', 'Email'],
    passwordHints: ['Password'],
    submitTexts: ['Log in', 'Log In']
  }),

  async healthCheck(controller, account, opts = {}) {
    const state = await checkFacebookState(controller, { actor: opts.actor });
    return { success: state === 'logged_in', status: STATUS_BY_STATE[state] || 'cooldown', state, reason: state };
  },

  runAction(controller, action, account, opts = {}) {
    return runFacebookAction(controller, action, { actor: opts.actor, onEvent: opts.onEvent });
  }
};
