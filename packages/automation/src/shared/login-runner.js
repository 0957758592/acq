import { findElement, getAllText, parseUIDump, delay } from '@acq/device-control';

import { createHumanActor } from '../human-actor.js';
import { unionTexts } from './selectors.js';

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
  // Some apps (e.g. LinkedIn) open on a "prereg" screen where the email/password
  // form is behind a button (e.g. "Sign in with Email"). preLoginTapTexts taps one
  // of these to reach the credential form, then re-reads the screen. Empty = the
  // form is on the first screen (most platforms).
  preLoginTapTexts = [],
  settleMs = 3000
} = {}) {
  const P = platform.toUpperCase();
  const seam = (suffix, message) => Object.assign(new Error(`${P}_${suffix}: ${message}`), { code: `${P}_${suffix}` });

  return async function login(controller, account = {}, opts = {}) {
    const actor = opts.actor || createHumanActor({ controller });
    // Union built-in seeds with operator selector overrides (verify-by-fact,
    // tuned for the live app build; supplied via opts.selectors).
    const ov = opts.selectors || {};
    const homeT = unionTexts(homeTexts, ov.homeTexts);
    const loginT = unionTexts(loginTexts, ov.loginTexts);
    const banT = unionTexts(banTexts, ov.banTexts);
    const checkT = unionTexts(checkpointTexts, ov.checkpointTexts);
    const userH = unionTexts(usernameHints, ov.usernameHints);
    const passH = unionTexts(passwordHints, ov.passwordHints);
    const submitT = unionTexts(submitTexts, ov.submitTexts);

    if (typeof controller.startApp === 'function') await controller.startApp(appPackage, launcherActivity).catch(() => {});
    await delay(settleMs);

    let nodes = parseUIDump(await controller.getUIDump());
    if (textPresent(nodes, banT)) return { ok: false, banned: true };
    if (textPresent(nodes, checkT)) return { ok: false, checkpointed: true };
    if (textPresent(nodes, homeT)) return { ok: true }; // already logged in
    if (loginT.length && !textPresent(nodes, loginT)) {
      throw seam('LOGIN_SCREEN_UNVERIFIED', 'login screen not recognized (verify selectors on a live device)');
    }

    const username = account.credentials?.username || account.credentials?.email;
    const password = account.credentials?.password;
    if (!username || !password) throw seam('CREDENTIALS_REQUIRED', 'username/email + password are required to log in');

    // Prereg flow: tap through to the credential form, then re-read the screen.
    const preTap = unionTexts(preLoginTapTexts, ov.preLoginTapTexts);
    if (preTap.length && !findElement(nodes, ...userH)) {
      await actor.findAndTap(preTap, { rounds: 2 }).catch(() => {});
      await delay(settleMs);
      nodes = parseUIDump(await controller.getUIDump());
    }

    const userField = findElement(nodes, ...userH);
    if (userField && typeof controller.inputText === 'function') {
      await actor.tapElement(userField, { afterMs: 400 });
      await controller.inputText(username);
    }
    const passField = findElement(parseUIDump(await controller.getUIDump()), ...passH);
    if (passField && typeof controller.inputText === 'function') {
      await actor.tapElement(passField, { afterMs: 400 });
      await controller.inputText(password);
    }
    await actor.findAndTap(submitT, { rounds: 2 }).catch(() => {});
    await delay(settleMs);

    nodes = parseUIDump(await controller.getUIDump());
    if (textPresent(nodes, banT)) return { ok: false, banned: true };
    if (textPresent(nodes, checkT)) return { ok: false, checkpointed: true };
    if (textPresent(nodes, homeT)) return { ok: true };
    throw seam('LOGIN_UNVERIFIED', 'login not confirmed on-device (verify-by-fact)');
  };
}
