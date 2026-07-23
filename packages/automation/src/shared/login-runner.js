import { findElement, getAllText, parseUIDump, delay } from '@acq/device-control';

import { createHumanActor } from '../human-actor.js';

// Builds a driver `login(controller, account, opts)` from per-platform selector
// seeds (TZ §9.4). Opens the app, classifies state (already-online / banned /
// checkpointed), and — if a login is needed — enters credentials and confirms by
// fact via the home markers. Every unknown fact is a coded verify-by-fact seam
// (LOGIN_SCREEN_UNVERIFIED / CREDENTIALS_REQUIRED / LOGIN_UNVERIFIED), never a
// fake "online". One control-flow, many platforms (REQUIREM DRY). Selector text
// sets are seeds — reconcile against a live device before production.
function textPresent(nodes, texts = []) {
  const haystack = getAllText(nodes).join('\n').toLowerCase();
  return texts.some((t) => haystack.includes(String(t).toLowerCase()));
}

export function buildLoginRunner({
  platform,
  appPackage,
  launcherActivity = '',
  homeTexts = [],
  loginTexts = [],
  banTexts = [],
  checkpointTexts = [],
  usernameHints = [],
  passwordHints = [],
  submitTexts = [],
  settleMs = 3000
} = {}) {
  const P = platform.toUpperCase();
  const seam = (suffix, message) => Object.assign(new Error(`${P}_${suffix}: ${message}`), { code: `${P}_${suffix}` });

  return async function login(controller, account = {}, opts = {}) {
    const actor = opts.actor || createHumanActor({ controller });
    if (typeof controller.startApp === 'function') await controller.startApp(appPackage, launcherActivity).catch(() => {});
    await delay(settleMs);

    let nodes = parseUIDump(await controller.getUIDump());
    if (textPresent(nodes, banTexts)) return { ok: false, banned: true };
    if (textPresent(nodes, checkpointTexts)) return { ok: false, checkpointed: true };
    if (textPresent(nodes, homeTexts)) return { ok: true }; // already logged in
    if (loginTexts.length && !textPresent(nodes, loginTexts)) {
      throw seam('LOGIN_SCREEN_UNVERIFIED', 'login screen not recognized (verify selectors on a live device)');
    }

    const username = account.credentials?.username || account.credentials?.email;
    const password = account.credentials?.password;
    if (!username || !password) throw seam('CREDENTIALS_REQUIRED', 'username/email + password are required to log in');

    const userField = findElement(nodes, ...usernameHints);
    if (userField && typeof controller.inputText === 'function') {
      await actor.tapElement(userField, { afterMs: 400 });
      await controller.inputText(username);
    }
    const passField = findElement(parseUIDump(await controller.getUIDump()), ...passwordHints);
    if (passField && typeof controller.inputText === 'function') {
      await actor.tapElement(passField, { afterMs: 400 });
      await controller.inputText(password);
    }
    await actor.findAndTap(submitTexts, { rounds: 2 }).catch(() => {});
    await delay(settleMs);

    nodes = parseUIDump(await controller.getUIDump());
    if (textPresent(nodes, banTexts)) return { ok: false, banned: true };
    if (textPresent(nodes, checkpointTexts)) return { ok: false, checkpointed: true };
    if (textPresent(nodes, homeTexts)) return { ok: true };
    throw seam('LOGIN_UNVERIFIED', 'login not confirmed on-device (verify-by-fact)');
  };
}
