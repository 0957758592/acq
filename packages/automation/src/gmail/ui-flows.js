// Gmail on-device UI flows — state classification + verification-code reading
// (the anchor role, TZ §7.2). Reuses the real extractVerificationCode. VERIFY-
// BY-FACT selector seeds; control flow is tested against canned UI dumps.
import { getAllText, parseUIDump } from '@acq/device-control';
import { extractVerificationCode } from '@acq/integrations';

import { anyTextPresent } from '../shared/confirmed-action.js';
import {
  GMAIL_BAN_TEXTS,
  GMAIL_CHECKPOINT_TEXTS,
  GMAIL_HOME_TEXTS,
  GMAIL_LOGIN_TEXTS
} from './constants.js';

class GmailFlowError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'GmailFlowError';
    this.code = code;
  }
}

export async function checkGmailState(controller) {
  const nodes = parseUIDump(await controller.getUIDump());
  if (anyTextPresent(nodes, GMAIL_BAN_TEXTS)) return 'banned';
  if (anyTextPresent(nodes, GMAIL_CHECKPOINT_TEXTS)) return 'checkpoint';
  if (anyTextPresent(nodes, GMAIL_HOME_TEXTS)) return 'logged_in';
  if (anyTextPresent(nodes, GMAIL_LOGIN_TEXTS)) return 'logged_out';
  return 'logged_out';
}

// Reads the verification code from the currently-open message (or the visible
// inbox preview). Fails with a coded seam when no code is found so the caller
// retries rather than proceeding blind.
export async function readVerificationCode(controller, { minLength = 4, maxLength = 8 } = {}) {
  const nodes = parseUIDump(await controller.getUIDump());
  const text = getAllText(nodes).join('\n');
  const code = extractVerificationCode(text, { minLength, maxLength });
  if (!code) {
    throw new GmailFlowError('VERIFICATION_CODE_TIMEOUT', 'no verification code visible in Gmail');
  }
  return code;
}

export { GmailFlowError };
