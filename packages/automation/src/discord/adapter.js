import { buildLoginRunner } from '../shared/login-runner.js';

import { checkDiscordState, runDiscordAction } from './ui-flows.js';
import {
  DISCORD_PACKAGE,
  DISCORD_LAUNCHER_ACTIVITY,
  DISCORD_HOME_TEXTS,
  DISCORD_LOGIN_TEXTS,
  DISCORD_BAN_TEXTS,
  DISCORD_CHECKPOINT_TEXTS
} from './constants.js';

const STATUS_BY_STATE = {
  logged_in: 'active',
  banned: 'banned',
  checkpoint: 'cooldown',
  logged_out: 'cooldown'
};

export const discordAdapter = {
  platform: 'discord',

  // Discord online = credential login (TZ §9.4). Selectors are verify-by-fact.
  login: buildLoginRunner({
    platform: 'discord',
    appPackage: DISCORD_PACKAGE,
    launcherActivity: DISCORD_LAUNCHER_ACTIVITY,
    homeTexts: DISCORD_HOME_TEXTS,
    loginTexts: DISCORD_LOGIN_TEXTS,
    banTexts: DISCORD_BAN_TEXTS,
    checkpointTexts: DISCORD_CHECKPOINT_TEXTS,
    usernameHints: ['Email', 'Enter your email', 'Email or Phone Number'],
    passwordHints: ['Password', 'Enter your password'],
    submitTexts: ['Log In', 'Login']
  }),

  async healthCheck(controller, account, opts = {}) {
    const state = await checkDiscordState(controller, { actor: opts.actor });
    return { success: state === 'logged_in', status: STATUS_BY_STATE[state] || 'cooldown', state, reason: state };
  },

  runAction(controller, action, account, opts = {}) {
    return runDiscordAction(controller, action, { actor: opts.actor, onEvent: opts.onEvent });
  }
};
