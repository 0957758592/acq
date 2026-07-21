// Telegram on-device UI flows.
//
// ⚠️ VERIFY-BY-FACT SEAM: selector strings in ./constants.js are English/version
// SEEDS, not captured from a live device. What is TESTED here is the CONTROL
// FLOW and ban/confirm classification against a fake controller with canned XML
// — NOT that any given label is correct on a real device. Re-capture the real
// UI and reconcile constants.js before trusting these flows in production.
import { parseUIDump } from '@acq/device-control';

import { anyTextPresent, runConfirmedAction } from '../shared/confirmed-action.js';
import {
  TELEGRAM_BAN_TEXTS,
  TELEGRAM_CHECKPOINT_TEXTS,
  TELEGRAM_DISMISS_TEXTS,
  TELEGRAM_HOME_TEXTS,
  TELEGRAM_LOGIN_TEXTS,
  TELEGRAM_JOIN_TEXTS,
  TELEGRAM_JOIN_CONFIRM_TEXTS,
  TELEGRAM_REPORT_TEXTS,
  TELEGRAM_REPORT_CONFIRM_TEXTS,
  TELEGRAM_DM_INPUT_TEXTS,
  TELEGRAM_DM_CONFIRM_TEXTS,
  TELEGRAM_VIEW_CONFIRM_TEXTS
} from './constants.js';

class TelegramFlowError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'TelegramFlowError';
    this.code = code;
  }
}

// Classify the current screen into a probe state (maps to engine-domain via the
// registry stateVocabulary: logged_in->online, banned->banned,
// checkpoint->checkpointed, logged_out->logged_out).
export async function checkTelegramState(controller) {
  const nodes = parseUIDump(await controller.getUIDump());
  if (anyTextPresent(nodes, TELEGRAM_BAN_TEXTS)) return 'banned';
  if (anyTextPresent(nodes, TELEGRAM_CHECKPOINT_TEXTS)) return 'checkpoint';
  if (anyTextPresent(nodes, TELEGRAM_HOME_TEXTS)) return 'logged_in';
  if (anyTextPresent(nodes, TELEGRAM_LOGIN_TEXTS)) return 'logged_out';
  return 'logged_out';
}

// Bring a Telegram account online. The account's on-device session format is a
// verify-by-fact seam until a real delivered session artifact is known — fail
// safe rather than guess (mirrors the whatsapp session-import seam).
export async function bringTelegramOnline(controller, { sessionRef } = {}) {
  if (!sessionRef) {
    throw new TelegramFlowError('TELEGRAM_SESSION_IMPORT_UNVERIFIED', 'no session reference to import');
  }
  throw new TelegramFlowError(
    'TELEGRAM_SESSION_IMPORT_UNVERIFIED',
    'Telegram on-device session-import format is not yet verified'
  );
}

const ACTION_CONFIG = {
  join: { triggerTexts: TELEGRAM_JOIN_TEXTS, confirmTexts: TELEGRAM_JOIN_CONFIRM_TEXTS },
  report: { triggerTexts: TELEGRAM_REPORT_TEXTS, confirmTexts: TELEGRAM_REPORT_CONFIRM_TEXTS },
  dm: { triggerTexts: TELEGRAM_DM_INPUT_TEXTS, confirmTexts: TELEGRAM_DM_CONFIRM_TEXTS },
  view: { triggerTexts: null, confirmTexts: TELEGRAM_VIEW_CONFIRM_TEXTS }
};

export const TELEGRAM_SUPPORTED_ACTIONS = Object.keys(ACTION_CONFIG);

export async function runTelegramAction(controller, action, { actor } = {}) {
  const config = ACTION_CONFIG[action?.type];
  if (!config) {
    throw new TelegramFlowError('ACTION_TYPE_UNSUPPORTED', `telegram does not support action '${action?.type}'`);
  }
  return runConfirmedAction(controller, {
    banTexts: TELEGRAM_BAN_TEXTS,
    checkpointTexts: TELEGRAM_CHECKPOINT_TEXTS,
    dismissTexts: TELEGRAM_DISMISS_TEXTS,
    ...config,
    actor
  });
}

export { TelegramFlowError };
