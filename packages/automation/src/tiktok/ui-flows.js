import {
  findDismissButton,
  findElement,
  findElementExact,
  getAllText,
  parseUIDump
} from '@acq/device-control';

import { generateTOTP } from '@acq/integrations';

import { createHumanActor } from '../human-actor.js';
import {
  TIKTOK_CHANGE_PHOTO_TEXTS,
  TIKTOK_CONTINUE_TEXTS,
  TIKTOK_DISMISS_TEXTS,
  TIKTOK_EDIT_PROFILE_TEXTS,
  TIKTOK_EMAIL_USERNAME_TAB_TEXTS,
  TIKTOK_LOGIN_OPTION_TEXTS,
  TIKTOK_LOGIN_TEXTS,
  TIKTOK_NEWEST_MEDIA_FALLBACK_POINT,
  TIKTOK_PACKAGE,
  TIKTOK_PACKAGES,
  TIKTOK_PASSWORD_SCREEN_TEXTS,
  TIKTOK_PROFILE_BIO_TEXTS,
  TIKTOK_PROFILE_NAME_TEXTS,
  TIKTOK_PROFILE_TEXTS,
  TIKTOK_SAVE_TEXTS,
  TIKTOK_SELECT_FROM_GALLERY_TEXTS,
  TIKTOK_SUBMIT_LOGIN_TEXTS,
  TIKTOK_VERIFICATION_TEXTS
} from './constants.js';

const HOME_TEXTS = ['For You', 'Following'];
const LOGIN_TEXTS = ['Log in', 'Sign up', 'Use phone', 'email', 'username'];
const CHALLENGE_TEXTS = ['verification code', 'enter the code', 'captcha', 'suspended', 'banned'];
const ACCOUNT_PROBLEM_TEXTS = [
  "couldn't find this account",
  "couldn't find account",
  'incorrect',
  "doesn't match",
  'try again'
];

async function elements(controller) {
  return parseUIDump(await controller.getUIDump());
}

function actorFor(controller, actor) {
  return actor || createHumanActor({ controller });
}

async function dismissPopups(controller, actor = null, rounds = 3) {
  const activeActor = actorFor(controller, actor);
  for (let index = 0; index < rounds; index += 1) {
    const found = findDismissButton(await elements(controller), TIKTOK_DISMISS_TEXTS);
    if (!found) break;
    await activeActor.tapElement(found, { afterMs: 650 });
  }
}

async function resolveTikTokPackage(controller) {
  if (typeof controller?.isAppInstalled !== 'function') return TIKTOK_PACKAGE;
  for (const packageName of TIKTOK_PACKAGES) {
    if (await controller.isAppInstalled(packageName).catch(() => false)) return packageName;
  }
  return '';
}

export async function ensureTikTokForeground(controller, { clean = false } = {}) {
  const packageName = await resolveTikTokPackage(controller);
  if (!packageName) return { ok: false, package: TIKTOK_PACKAGE, reason: 'tiktok_not_installed' };
  if (clean && controller.cleanAppHome) await controller.cleanAppHome(packageName).catch(() => {});
  const ok = await controller.startApp(packageName).catch(() => false);
  return { ok: Boolean(ok), package: packageName, reason: ok ? '' : 'tiktok_launch_failed' };
}

export async function checkTikTokLoginState(controller, { actor = null } = {}) {
  const activeActor = actorFor(controller, actor);
  const launch = await ensureTikTokForeground(controller);
  if (!launch.ok) return 'unknown';
  await activeActor.pause({ meanMs: 3_000, standardDeviationMs: 450, minMs: 1_800, maxMs: 4_500 });
  await dismissPopups(controller, activeActor);
  const visible = await activeActor.elements();
  await activeActor.read(visible);
  const text = getAllText(visible).join(' ').toLowerCase();
  const hasHome = HOME_TEXTS.some((item) => text.includes(item.toLowerCase()));
  const hasLogin = LOGIN_TEXTS.some((item) => text.includes(item.toLowerCase()));
  if (hasHome && !hasLogin) return 'logged_in';
  if (hasLogin) return 'logged_out';
  return 'unknown';
}

async function typeIntoFirstEditTextHuman(actor, value) {
  const editText = (await actor.elements()).find((item) => /edittext|editabletext/i.test(item.className || ''));
  if (editText) await actor.tapElement(editText);
  await actor.type(value);
  await actor.pause({ meanMs: 650, standardDeviationMs: 180, minMs: 250, maxMs: 1_400 });
}

async function visibleText(actor) {
  return getAllText(await actor.elements()).join(' ').toLowerCase();
}

function includesAny(text = '', candidates = []) {
  return candidates.some((item) => text.includes(String(item).toLowerCase()));
}

const VERIFICATION_REJECT_TEXTS = [
  'incorrect',
  'invalid',
  "didn't match",
  'wrong code',
  'try again',
  'code expired',
  'expired'
];

async function submitVerificationCode(actor, code) {
  await typeIntoFirstEditTextHuman(actor, code);
  await actor.findAndTap(['Continue', 'Verify', 'Submit']);
  await actor.pause({ meanMs: 5_000, standardDeviationMs: 900, minMs: 3_000, maxMs: 8_000 });
}

async function handleEmailVerification(actor, emailCodeFetcher) {
  if (!emailCodeFetcher) return { success: false, status: 'checkpointed', reason: 'email_code_required' };
  const code = await emailCodeFetcher.fetchLatestCode();
  if (!code) return { success: false, status: 'checkpointed', reason: 'email_code_not_found' };
  await submitVerificationCode(actor, code);
  return null;
}

// 2FA code entry. Prefers an authenticator (TOTP) seed — works offline, no inbox,
// unlike the email path. Mirrors instagrowth-saas relogin-fleet.ts: submit the
// current 30s-window code, and retry once on rejection (covers a window rollover
// during typing). Falls back to the email-code fetcher when no seed is present.
export async function handleVerification(actor, { emailCodeFetcher = null, totpSecret = '' } = {}) {
  if (totpSecret) {
    await submitVerificationCode(actor, generateTOTP(totpSecret));
    if (includesAny(await visibleText(actor), VERIFICATION_REJECT_TEXTS)) {
      await actor.controller?.clearField?.();
      await submitVerificationCode(actor, generateTOTP(totpSecret));
    }
    return null;
  }
  return handleEmailVerification(actor, emailCodeFetcher);
}

async function waitForTikTokPasswordScreen(controller, actor) {
  const startedAt = Date.now();
  const timeoutMs = 15_000;

  while (Date.now() - startedAt < timeoutMs) {
    await dismissPopups(controller, actor, 1);
    const passwordField = await actor.waitFor(TIKTOK_PASSWORD_SCREEN_TEXTS, { timeoutMs: 1_500, intervalMs: 500 });
    if (passwordField) return { ready: true };

    const text = await visibleText(actor);
    if (includesAny(text, TIKTOK_VERIFICATION_TEXTS)) return { ready: false, status: 'verification_needed', reason: text };
    if (includesAny(text, ACCOUNT_PROBLEM_TEXTS)) return { ready: false, status: 'needs_account', reason: text };
  }

  return { ready: false, status: 'checkpointed', reason: await visibleText(actor) };
}

async function pushProfilePhoto(controller, avatarUrl) {
  if (!avatarUrl) return false;
  await controller.client.pushFileByUrl([controller.padCode], avatarUrl, {
    customizeFilePath: '/DCIM/Camera/',
    autoInstall: 0
  });
  await controller.shell('am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera/');
  return true;
}

async function setupProfilePhoto(controller, actor, avatarUrl) {
  if (!avatarUrl) return false;
  await pushProfilePhoto(controller, avatarUrl);
  const opened = await actor.findAndTap(TIKTOK_CHANGE_PHOTO_TEXTS);
  if (!opened) return false;
  await actor.findAndTap(TIKTOK_SELECT_FROM_GALLERY_TEXTS).catch(() => false);
  await actor.tapElement(TIKTOK_NEWEST_MEDIA_FALLBACK_POINT, { allowMiss: false });
  await actor.findAndTap(TIKTOK_SAVE_TEXTS, { rounds: 4 }).catch(() => false);
  return true;
}

export async function loginTikTok(
  controller,
  { username = '', email = '', password = '', emailCodeFetcher = null, totpSecret = '' } = {},
  { actor = null } = {}
) {
  const identifier = String(email || username || '').trim();
  if (!identifier || !password) {
    return {
      success: false,
      status: 'missing_credentials',
      reason: !identifier ? 'missing_login_identifier' : 'missing_password'
    };
  }

  const activeActor = actorFor(controller, actor);
  const launch = await ensureTikTokForeground(controller, { clean: true });
  if (!launch.ok) return { success: false, status: 'checkpointed', reason: launch.reason || 'tiktok_launch_failed' };
  await activeActor.pause({ meanMs: 4_000, standardDeviationMs: 600, minMs: 2_500, maxMs: 6_000 });
  await dismissPopups(controller, activeActor, 5);

  // Session reuse: TikTok stays signed in on the device, so the device is the
  // session store (1:1 account↔device). If already logged in, skip the flow.
  if ((await checkTikTokLoginState(controller, { actor: activeActor })) === 'logged_in') {
    return { success: true, status: 'active', reason: 'session_reused', twoFactorState: '' };
  }

  let twoFactorState = '';
  await activeActor.findAndTap(TIKTOK_PROFILE_TEXTS);
  await activeActor.findAndTap(TIKTOK_LOGIN_TEXTS);
  await activeActor.findAndTap(TIKTOK_LOGIN_OPTION_TEXTS);
  await activeActor.findAndTap(TIKTOK_EMAIL_USERNAME_TAB_TEXTS);

  await typeIntoFirstEditTextHuman(activeActor, identifier);
  await activeActor.findAndTap(TIKTOK_CONTINUE_TEXTS);

  const passwordScreen = await waitForTikTokPasswordScreen(controller, activeActor);
  if (!passwordScreen.ready) {
    if (passwordScreen.status === 'verification_needed') {
      const verificationResult = await handleVerification(activeActor, { emailCodeFetcher, totpSecret });
      if (verificationResult) return verificationResult;
      twoFactorState = totpSecret ? 'totp' : 'email';
      const postVerificationPasswordScreen = await waitForTikTokPasswordScreen(controller, activeActor);
      if (!postVerificationPasswordScreen.ready) {
        return {
          success: false,
          status: postVerificationPasswordScreen.status || 'checkpointed',
          reason: postVerificationPasswordScreen.reason || postVerificationPasswordScreen.status
        };
      }
    } else {
      return { success: false, status: passwordScreen.status || 'checkpointed', reason: passwordScreen.reason };
    }
  }

  await typeIntoFirstEditTextHuman(activeActor, password);
  await activeActor.findAndTap(TIKTOK_SUBMIT_LOGIN_TEXTS);
  await activeActor.pause({ meanMs: 5_000, standardDeviationMs: 900, minMs: 3_000, maxMs: 8_000 });

  let text = await visibleText(activeActor);
  if (includesAny(text, TIKTOK_VERIFICATION_TEXTS)) {
    // Post-password 2FA prompt — the authenticator (TOTP) step. Use the unified
    // handler so a TOTP seed is preferred here, not just the email fallback.
    const verificationResult = await handleVerification(activeActor, { emailCodeFetcher, totpSecret });
    if (verificationResult) return verificationResult;
    twoFactorState = totpSecret ? 'totp' : 'email';
  }

  text = await visibleText(activeActor);
  if (CHALLENGE_TEXTS.some((item) => text.includes(item))) {
    return { success: false, status: 'checkpointed', reason: text.includes('captcha') ? 'captcha' : text };
  }

  const state = await checkTikTokLoginState(controller, { actor: activeActor });
  return {
    success: state === 'logged_in',
    status: state === 'logged_in' ? 'active' : 'checkpointed',
    reason: state,
    twoFactorState
  };
}

export async function setupTikTokProfile(
  controller,
  { displayName = '', bio = '', avatarUrl = '' } = {},
  { actor = null } = {}
) {
  const activeActor = actorFor(controller, actor);
  const launch = await ensureTikTokForeground(controller);
  if (!launch.ok) return { success: false, status: 'checkpointed', reason: launch.reason || 'tiktok_launch_failed' };
  await activeActor.pause({ meanMs: 3_000, standardDeviationMs: 450, minMs: 1_800, maxMs: 4_500 });
  await dismissPopups(controller, activeActor);
  await activeActor.findAndTap(TIKTOK_PROFILE_TEXTS);
  await activeActor.findAndTap(TIKTOK_EDIT_PROFILE_TEXTS);

  await setupProfilePhoto(controller, activeActor, avatarUrl);

  if (displayName) {
    await activeActor.findAndTap(TIKTOK_PROFILE_NAME_TEXTS);
    await controller.clearField(40);
    await activeActor.type(displayName);
    await activeActor.findAndTap(TIKTOK_SAVE_TEXTS);
  }

  if (bio) {
    await activeActor.findAndTap(TIKTOK_PROFILE_BIO_TEXTS);
    await controller.clearField(120);
    await activeActor.type(bio);
    await activeActor.findAndTap(TIKTOK_SAVE_TEXTS);
  }

  const text = getAllText(await activeActor.elements()).join(' ');
  const saved = displayName ? text.includes(displayName) : true;
  return { success: saved, status: saved ? 'active' : 'checkpointed' };
}

export { findElement, findElementExact };
