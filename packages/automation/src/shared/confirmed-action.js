// Shared confirm-by-fact action runner for on-device platform drivers
// (TZ §9.5). Success is claimed ONLY when a confirmation signal is visible;
// a mid-flow ban/checkpoint is detected and reported instead of a false
// success. Reused across telegram/discord/… so the control flow lives once
// (REQUIREM DRY). Selector text sets are passed in per platform (verify-by-fact).
import { findElement, getAllText, parseUIDump } from '@acq/device-control';

import { createHumanActor } from '../human-actor.js';

class ConfirmedActionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'ConfirmedActionError';
    this.code = code;
  }
}

async function elements(controller) {
  return parseUIDump(await controller.getUIDump());
}

export function anyTextPresent(nodes, texts = []) {
  const haystack = getAllText(nodes).join('\n').toLowerCase();
  return texts.some((t) => haystack.includes(String(t).toLowerCase()));
}

async function dismissPopups(controller, actor, dismissTexts = [], rounds = 2) {
  if (!dismissTexts.length) return;
  for (let i = 0; i < rounds; i += 1) {
    const found = findElement(await elements(controller), ...dismissTexts);
    if (!found) break;
    await actor.tapElement(found, { afterMs: 500 });
  }
}

export async function runConfirmedAction(controller, {
  banTexts = [],
  checkpointTexts = [],
  dismissTexts = [],
  triggerTexts = null,
  confirmTexts = [],
  actor
} = {}) {
  const activeActor = actor || createHumanActor({ controller });
  await dismissPopups(controller, activeActor, dismissTexts);

  const preNodes = await elements(controller);
  if (anyTextPresent(preNodes, banTexts)) return { ok: false, banned: true };
  if (anyTextPresent(preNodes, checkpointTexts)) return { ok: false, checkpointed: true };

  if (triggerTexts) {
    await activeActor.findAndTap(triggerTexts, { rounds: 3 });
  }

  const postNodes = await elements(controller);
  if (anyTextPresent(postNodes, banTexts)) return { ok: false, banned: true };
  if (anyTextPresent(postNodes, confirmTexts)) return { ok: true };

  throw new ConfirmedActionError('ACTION_NOT_CONFIRMED', 'no confirmation signal after action');
}

export { ConfirmedActionError };
