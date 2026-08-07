// LinkedIn on-device UI flows. VERIFY-BY-FACT selector seeds in ./constants.js;
// what is tested is the control flow + ban/confirm classification. Reuses the
// shared confirm-by-fact runner (DRY), mirroring the discord/instagram drivers.
import { parseUIDump, delay } from '@acq/device-control';

import { anyTextPresent, runConfirmedAction } from '../shared/confirmed-action.js';
import {
  LINKEDIN_PACKAGE,
  LINKEDIN_LAUNCHER_ACTIVITY,
  LINKEDIN_BAN_TEXTS,
  LINKEDIN_CHECKPOINT_TEXTS,
  LINKEDIN_DISMISS_TEXTS,
  LINKEDIN_HOME_TEXTS,
  LINKEDIN_LOGIN_TEXTS,
  LINKEDIN_CONNECT_TEXTS,
  LINKEDIN_CONNECT_CONFIRM_TEXTS,
  LINKEDIN_FOLLOW_TEXTS,
  LINKEDIN_FOLLOW_CONFIRM_TEXTS,
  LINKEDIN_LIKE_TEXTS,
  LINKEDIN_LIKE_CONFIRM_TEXTS,
  LINKEDIN_COMMENT_INPUT_TEXTS,
  LINKEDIN_COMMENT_CONFIRM_TEXTS,
  LINKEDIN_DM_INPUT_TEXTS,
  LINKEDIN_DM_CONFIRM_TEXTS
} from './constants.js';

class LinkedinFlowError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'LinkedinFlowError';
    this.code = code;
  }
}

export async function checkLinkedinState(controller) {
  // Open LinkedIn first so the UI dump we read is LinkedIn's — a not-foreground/
  // absent app must never read as logged_in.
  await controller.startApp(LINKEDIN_PACKAGE, LINKEDIN_LAUNCHER_ACTIVITY).catch(() => {});
  await delay(2_500);
  const nodes = parseUIDump(await controller.getUIDump());
  if (anyTextPresent(nodes, LINKEDIN_BAN_TEXTS)) return 'banned';
  if (anyTextPresent(nodes, LINKEDIN_CHECKPOINT_TEXTS)) return 'checkpoint';
  if (anyTextPresent(nodes, LINKEDIN_HOME_TEXTS)) return 'logged_in';
  if (anyTextPresent(nodes, LINKEDIN_LOGIN_TEXTS)) return 'logged_out';
  return 'logged_out';
}

const ACTION_CONFIG = {
  connect: { triggerTexts: LINKEDIN_CONNECT_TEXTS, confirmTexts: LINKEDIN_CONNECT_CONFIRM_TEXTS },
  follow: { triggerTexts: LINKEDIN_FOLLOW_TEXTS, confirmTexts: LINKEDIN_FOLLOW_CONFIRM_TEXTS },
  like: { triggerTexts: LINKEDIN_LIKE_TEXTS, confirmTexts: LINKEDIN_LIKE_CONFIRM_TEXTS },
  comment: { triggerTexts: LINKEDIN_COMMENT_INPUT_TEXTS, confirmTexts: LINKEDIN_COMMENT_CONFIRM_TEXTS },
  dm: { triggerTexts: LINKEDIN_DM_INPUT_TEXTS, confirmTexts: LINKEDIN_DM_CONFIRM_TEXTS }
};

export const LINKEDIN_SUPPORTED_ACTIONS = Object.keys(ACTION_CONFIG);

export async function runLinkedinAction(controller, action, { actor } = {}) {
  const config = ACTION_CONFIG[action?.type];
  if (!config) {
    throw new LinkedinFlowError('ACTION_TYPE_UNSUPPORTED', `linkedin does not support action '${action?.type}'`);
  }
  return runConfirmedAction(controller, {
    banTexts: LINKEDIN_BAN_TEXTS,
    checkpointTexts: LINKEDIN_CHECKPOINT_TEXTS,
    dismissTexts: LINKEDIN_DISMISS_TEXTS,
    ...config,
    actor
  });
}

export { LinkedinFlowError };
