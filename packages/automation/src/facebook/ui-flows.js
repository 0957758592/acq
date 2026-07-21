// Facebook on-device UI flows. VERIFY-BY-FACT seeds; reuses the shared
// confirm-by-fact runner (DRY).
import { parseUIDump } from '@acq/device-control';

import { anyTextPresent, runConfirmedAction } from '../shared/confirmed-action.js';
import {
  FACEBOOK_BAN_TEXTS,
  FACEBOOK_CHECKPOINT_TEXTS,
  FACEBOOK_DISMISS_TEXTS,
  FACEBOOK_HOME_TEXTS,
  FACEBOOK_LOGIN_TEXTS,
  FACEBOOK_POST_TEXTS,
  FACEBOOK_POST_CONFIRM_TEXTS,
  FACEBOOK_JOIN_TEXTS,
  FACEBOOK_JOIN_CONFIRM_TEXTS,
  FACEBOOK_REPORT_TEXTS,
  FACEBOOK_REPORT_CONFIRM_TEXTS,
  FACEBOOK_LIKE_TEXTS,
  FACEBOOK_LIKE_CONFIRM_TEXTS
} from './constants.js';

class FacebookFlowError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'FacebookFlowError';
    this.code = code;
  }
}

export async function checkFacebookState(controller) {
  const nodes = parseUIDump(await controller.getUIDump());
  if (anyTextPresent(nodes, FACEBOOK_BAN_TEXTS)) return 'banned';
  if (anyTextPresent(nodes, FACEBOOK_CHECKPOINT_TEXTS)) return 'checkpoint';
  if (anyTextPresent(nodes, FACEBOOK_HOME_TEXTS)) return 'logged_in';
  if (anyTextPresent(nodes, FACEBOOK_LOGIN_TEXTS)) return 'logged_out';
  return 'logged_out';
}

const ACTION_CONFIG = {
  post: { triggerTexts: FACEBOOK_POST_TEXTS, confirmTexts: FACEBOOK_POST_CONFIRM_TEXTS },
  join: { triggerTexts: FACEBOOK_JOIN_TEXTS, confirmTexts: FACEBOOK_JOIN_CONFIRM_TEXTS },
  report: { triggerTexts: FACEBOOK_REPORT_TEXTS, confirmTexts: FACEBOOK_REPORT_CONFIRM_TEXTS },
  like: { triggerTexts: FACEBOOK_LIKE_TEXTS, confirmTexts: FACEBOOK_LIKE_CONFIRM_TEXTS }
};

export const FACEBOOK_SUPPORTED_ACTIONS = Object.keys(ACTION_CONFIG);

export async function runFacebookAction(controller, action, { actor } = {}) {
  const config = ACTION_CONFIG[action?.type];
  if (!config) {
    throw new FacebookFlowError('ACTION_TYPE_UNSUPPORTED', `facebook does not support action '${action?.type}'`);
  }
  return runConfirmedAction(controller, {
    banTexts: FACEBOOK_BAN_TEXTS,
    checkpointTexts: FACEBOOK_CHECKPOINT_TEXTS,
    dismissTexts: FACEBOOK_DISMISS_TEXTS,
    ...config,
    actor
  });
}

export { FacebookFlowError };
