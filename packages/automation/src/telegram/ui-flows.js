// Telegram on-device UI flows.
//
// ⚠️ VERIFY-BY-FACT SEAM: selector strings in ./constants.js are English/version
// SEEDS, not captured from a live device. What is TESTED here is the CONTROL
// FLOW and ban/confirm classification against a fake controller with canned XML
// — NOT that any given label is correct on a real device. Re-capture the real
// UI and reconcile constants.js before trusting these flows in production.
import { findElement, getAllText, parseUIDump } from '@acq/device-control';

import { createHumanActor } from '../human-actor.js';
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

async function elements(controller) {
  return parseUIDump(await controller.getUIDump());
}

function anyTextPresent(nodes, texts) {
  const haystack = getAllText(nodes).join('\n').toLowerCase();
  return texts.some((t) => haystack.includes(String(t).toLowerCase()));
}

// Classify the current screen into a probe state (maps to engine-domain via the
// registry stateVocabulary: logged_in->online, banned->banned,
// checkpoint->checkpointed, logged_out->logged_out).
export async function checkTelegramState(controller) {
  const nodes = await elements(controller);
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

async function dismissPopups(controller, actor, rounds = 2) {
  for (let i = 0; i < rounds; i += 1) {
    const found = findElement(await elements(controller), ...TELEGRAM_DISMISS_TEXTS);
    if (!found) break;
    await actor.tapElement(found, { afterMs: 500 });
  }
}

// Shared confirm-by-fact action runner (DRY across join/report/dm/view). Taps
// the action control, then verifies a confirmation signal is present. Detects a
// mid-flow ban and returns it instead of a false success. Success is claimed
// ONLY on a confirmation signal — never a blind tap (TZ §9.5).
async function runConfirmedAction(controller, { triggerTexts, confirmTexts, actor }) {
  const activeActor = actor || createHumanActor({ controller });
  await dismissPopups(controller, activeActor);

  const preNodes = await elements(controller);
  if (anyTextPresent(preNodes, TELEGRAM_BAN_TEXTS)) return { ok: false, banned: true };
  if (anyTextPresent(preNodes, TELEGRAM_CHECKPOINT_TEXTS)) return { ok: false, checkpointed: true };

  if (triggerTexts) {
    await activeActor.findAndTap(triggerTexts, { rounds: 3 });
  }

  const postNodes = await elements(controller);
  if (anyTextPresent(postNodes, TELEGRAM_BAN_TEXTS)) return { ok: false, banned: true };
  if (anyTextPresent(postNodes, confirmTexts)) return { ok: true };

  throw new TelegramFlowError('ACTION_NOT_CONFIRMED', 'no confirmation signal after action');
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
  return runConfirmedAction(controller, { ...config, actor });
}

export { TelegramFlowError };
