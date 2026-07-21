// WhatsApp on-device UI flows.
//
// ⚠️ VERIFY-BY-FACT SEAM: the selector STRINGS + fallback tap points live in
// ./constants.js and are English/version SEEDS captured from docs, not a live
// DuoPlus WhatsApp dump. What is TESTED here is the CONTROL FLOW and ban
// handling (parse → classify → decide) against a fake controller with canned
// XML — NOT that a given label/resource-id/coordinate is correct on a real
// device. Re-capture the real UI (getUIDump/screenshot) and reconcile
// constants.js before trusting reportTarget in production.
import { findByResourceId, findElement, findElementExact, getAllText, parseUIDump } from '@acq/device-control';
import { domainError } from '@acq/whatsapp';

import { createHumanActor } from '../human-actor.js';
import {
  WHATSAPP_BAN_TEXTS,
  WHATSAPP_BLOCK_REPORT_TEXTS,
  WHATSAPP_DISMISS_TEXTS,
  WHATSAPP_HOME_TEXTS,
  WHATSAPP_LAUNCHER_ACTIVITY,
  WHATSAPP_OVERFLOW_FALLBACK_POINT,
  WHATSAPP_OVERFLOW_RESOURCE_IDS,
  WHATSAPP_OVERFLOW_TEXTS,
  WHATSAPP_PACKAGE,
  WHATSAPP_REPORT_CONFIRM_TEXTS,
  WHATSAPP_REPORT_FALLBACK_POINT,
  WHATSAPP_REPORT_TEXTS
} from './constants.js';

async function elements(controller) {
  return parseUIDump(await controller.getUIDump());
}

// Best-effort popup clearing. Mirrors tiktok/ui-flows: bounded rounds, tap the
// first dismiss-like control found, break as soon as none remain. Never throws.
async function dismissPopups(controller, actor = null, rounds = 3) {
  const activeActor = actor || createHumanActor({ controller });
  for (let index = 0; index < rounds; index += 1) {
    const found = findElement(await elements(controller), ...WHATSAPP_DISMISS_TEXTS);
    if (!found) break;
    await activeActor.tapElement(found, { afterMs: 650 });
  }
}

// Tap a resolved element, or the provisional fallback point when it wasn't
// found. The point branch is the fragile, verify-by-fact path — and because a
// blind fallback tap proves nothing, success is NOT inferred from it (see the
// confirmation gate in reportTarget).
async function tapElementOrPoint(controller, actor, element, point) {
  if (element) return actor.tapElement(element);
  await controller.tap(point.x, point.y);
  await actor.pause();
  return false;
}

export function detectBanScreen(els) {
  const text = getAllText(els).join(' ').toLowerCase();
  return WHATSAPP_BAN_TEXTS.some((phrase) => text.includes(phrase.toLowerCase()));
}

export async function checkWhatsappState(controller) {
  await controller.startApp(WHATSAPP_PACKAGE, WHATSAPP_LAUNCHER_ACTIVITY);
  await dismissPopups(controller);
  const els = await elements(controller);
  const text = getAllText(els).join(' ').toLowerCase();
  if (detectBanScreen(els)) return 'banned';
  const homeHits = WHATSAPP_HOME_TEXTS.filter((label) => text.includes(label.toLowerCase())).length;
  if (homeHits >= 2) return 'logged_in';
  if (!text) return 'unknown';
  return 'logged_out';
}

export async function reportTarget(controller, { targetMsisdn, alsoBlock = false } = {}) {
  const actor = createHumanActor({ controller });
  const digits = String(targetMsisdn).replace(/[^0-9]/g, '');
  if (!digits) throw domainError('WHATSAPP_REPORT_TARGET_INVALID', 'targetMsisdn required');

  // Open the target's chat via a wa.me deep link — robust vs. fragile in-app
  // search, and it works whether or not the number is a saved contact.
  await controller.shell(
    `am start -a android.intent.action.VIEW -d "https://wa.me/${digits}" ${WHATSAPP_PACKAGE}`
  );
  await actor.pause();

  if (detectBanScreen(await elements(controller))) return { ok: false, banned: true };

  // Open the overflow menu: resource-id first, then label, else provisional point.
  const overflowEls = await elements(controller);
  const overflow =
    WHATSAPP_OVERFLOW_RESOURCE_IDS.map((id) => findByResourceId(overflowEls, id)).find(Boolean) ||
    findElement(overflowEls, ...WHATSAPP_OVERFLOW_TEXTS);
  await tapElementOrPoint(controller, actor, overflow, WHATSAPP_OVERFLOW_FALLBACK_POINT);

  // Tap the Report menu item. Use an EXACT match so a plain "Report" doesn't
  // substring-hit "Report and block"/"Report business"; prefer the block label
  // when alsoBlock. Fall back to substring only if no exact item is present.
  const reportLabels = alsoBlock ? [...WHATSAPP_BLOCK_REPORT_TEXTS, ...WHATSAPP_REPORT_TEXTS] : WHATSAPP_REPORT_TEXTS;
  const reportEls = await elements(controller);
  const reportItem = findElementExact(reportEls, ...reportLabels) || findElement(reportEls, ...reportLabels);
  await tapElementOrPoint(controller, actor, reportItem, WHATSAPP_REPORT_FALLBACK_POINT);

  // Confirmation gate: claim success ONLY when WhatsApp shows a confirmation
  // screen — never from a blind fallback tap (a false "reported" makes callers
  // stop retrying). A ban can also surface mid-flow (opening the chat/menu can
  // trip it). WHATSAPP_REPORT_CONFIRM_TEXTS is a verify-by-fact seed.
  const confirmEls = await elements(controller);
  if (detectBanScreen(confirmEls)) return { ok: false, banned: true };
  if (findElement(confirmEls, ...WHATSAPP_REPORT_CONFIRM_TEXTS)) return { ok: true };
  return { ok: false };
}

// SESSION-IMPORT SEAM — intentionally unimplemented. Bringing an account online
// requires importing a purchased session onto the device, and the on-device
// import mechanism is coupled to the dark.shopping delivery format (a Plan 3
// concern). Implement this only once the Plan-3 delivery format + a real
// session artifact are known; shipping a guessed importer risks nuking sessions.
export async function bringWhatsappOnline(_controller, { sessionRef: _sessionRef } = {}) {
  throw domainError(
    'WHATSAPP_SESSION_IMPORT_UNVERIFIED',
    'session-import mechanism depends on the dark.shopping delivery format (Plan 3 seam) — implement against a real session artifact first'
  );
}
