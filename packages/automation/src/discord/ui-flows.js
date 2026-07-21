// Discord on-device UI flows. VERIFY-BY-FACT selector seeds in ./constants.js;
// what is tested is the control flow + ban/confirm classification. Reuses the
// shared confirm-by-fact runner (DRY).
import { parseUIDump } from '@acq/device-control';

import { anyTextPresent, runConfirmedAction } from '../shared/confirmed-action.js';
import {
  DISCORD_BAN_TEXTS,
  DISCORD_CHECKPOINT_TEXTS,
  DISCORD_DISMISS_TEXTS,
  DISCORD_HOME_TEXTS,
  DISCORD_LOGIN_TEXTS,
  DISCORD_JOIN_TEXTS,
  DISCORD_JOIN_CONFIRM_TEXTS,
  DISCORD_DM_INPUT_TEXTS,
  DISCORD_DM_CONFIRM_TEXTS,
  DISCORD_REPORT_TEXTS,
  DISCORD_REPORT_CONFIRM_TEXTS
} from './constants.js';

class DiscordFlowError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'DiscordFlowError';
    this.code = code;
  }
}

export async function checkDiscordState(controller) {
  const nodes = parseUIDump(await controller.getUIDump());
  if (anyTextPresent(nodes, DISCORD_BAN_TEXTS)) return 'banned';
  if (anyTextPresent(nodes, DISCORD_CHECKPOINT_TEXTS)) return 'checkpoint';
  if (anyTextPresent(nodes, DISCORD_HOME_TEXTS)) return 'logged_in';
  if (anyTextPresent(nodes, DISCORD_LOGIN_TEXTS)) return 'logged_out';
  return 'logged_out';
}

const ACTION_CONFIG = {
  join: { triggerTexts: DISCORD_JOIN_TEXTS, confirmTexts: DISCORD_JOIN_CONFIRM_TEXTS },
  dm: { triggerTexts: DISCORD_DM_INPUT_TEXTS, confirmTexts: DISCORD_DM_CONFIRM_TEXTS },
  report: { triggerTexts: DISCORD_REPORT_TEXTS, confirmTexts: DISCORD_REPORT_CONFIRM_TEXTS }
};

export const DISCORD_SUPPORTED_ACTIONS = Object.keys(ACTION_CONFIG);

export async function runDiscordAction(controller, action, { actor } = {}) {
  const config = ACTION_CONFIG[action?.type];
  if (!config) {
    throw new DiscordFlowError('ACTION_TYPE_UNSUPPORTED', `discord does not support action '${action?.type}'`);
  }
  return runConfirmedAction(controller, {
    banTexts: DISCORD_BAN_TEXTS,
    checkpointTexts: DISCORD_CHECKPOINT_TEXTS,
    dismissTexts: DISCORD_DISMISS_TEXTS,
    ...config,
    actor
  });
}

export { DiscordFlowError };
