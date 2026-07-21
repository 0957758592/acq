import {
  delay,
  findDismissButton,
  findElement,
  getAllText,
  parseUIDump
} from '@acq/device-control';
import { generateTOTP } from '@acq/integrations';

import {
  YOUTUBE_AUTHENTICATOR_TEXTS,
  YOUTUBE_CAPTION_TEXTS,
  YOUTUBE_CAPTCHA_TEXTS,
  YOUTUBE_CODE_REJECT_TEXTS,
  YOUTUBE_CREATE_FALLBACK_POINT,
  YOUTUBE_CREATE_TEXTS,
  YOUTUBE_DISMISS_TEXTS,
  YOUTUBE_EMAIL_TEXTS,
  YOUTUBE_HOME_TEXTS,
  YOUTUBE_NEWEST_MEDIA_FALLBACK_POINT,
  YOUTUBE_NEXT_TEXTS,
  YOUTUBE_PACKAGE,
  YOUTUBE_PASSWORD_TEXTS,
  YOUTUBE_POST_TEXTS,
  YOUTUBE_SIGN_IN_TEXTS,
  YOUTUBE_SUSPICIOUS_TEXTS,
  YOUTUBE_TRY_ANOTHER_WAY_TEXTS,
  YOUTUBE_TWO_FACTOR_TEXTS,
  YOUTUBE_UPLOAD_TEXTS
} from './constants.js';

async function elements(controller) {
  return parseUIDump(await controller.getUIDump());
}

function textOf(items = []) {
  return getAllText(items).join(' ').toLowerCase();
}

function includesAny(text = '', candidates = []) {
  return candidates.some((item) => text.includes(String(item).toLowerCase()));
}

function shellQuote(value = '') {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function captionText({ caption = '', hashtags = [] } = {}) {
  const tags = hashtags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ');
  return [caption, tags].filter(Boolean).join('\n\n');
}

function challengeFromText(text = '') {
  if (includesAny(text, YOUTUBE_TWO_FACTOR_TEXTS)) return 'two_factor';
  if (includesAny(text, YOUTUBE_CAPTCHA_TEXTS)) return 'captcha';
  if (includesAny(text, YOUTUBE_SUSPICIOUS_TEXTS)) return 'suspicious_login';
  return '';
}

async function hasEditField(controller) {
  return (await elements(controller)).some((item) => /edittext|editabletext/i.test(item.className || ''));
}

// Google 2-Step Verification with an authenticator (TOTP) seed. Best-effort steer
// to the authenticator-code entry (Google may show a prompt/other method first),
// type the generated code, and retry once on rejection (window rollover). Mirrors
// instagrowth-saas relogin-fleet.ts. No-op without a seed → caller checkpoints.
export async function handleYouTubeTwoFactor(controller, totpSecret) {
  if (!totpSecret) return;
  if (!(await hasEditField(controller))) {
    await tapFirst(controller, YOUTUBE_TRY_ANOTHER_WAY_TEXTS);
    await delay(1_500);
    await tapFirst(controller, YOUTUBE_AUTHENTICATOR_TEXTS);
    await delay(2_000);
  }
  await typeIntoFirstEditText(controller, generateTOTP(totpSecret));
  await tapFirst(controller, YOUTUBE_NEXT_TEXTS);
  await delay(6_000);
  if (includesAny(textOf(await elements(controller)), YOUTUBE_CODE_REJECT_TEXTS)) {
    await controller.clearField?.();
    await typeIntoFirstEditText(controller, generateTOTP(totpSecret));
    await tapFirst(controller, YOUTUBE_NEXT_TEXTS);
    await delay(6_000);
  }
}

async function dismissPopups(controller, rounds = 4) {
  for (let index = 0; index < rounds; index += 1) {
    const found = findDismissButton(await elements(controller), YOUTUBE_DISMISS_TEXTS);
    if (!found) break;
    await controller.tap(found.x, found.y);
    await delay(800);
  }
}

async function tapFirst(controller, labels, fallback = null) {
  const found = findElement(await elements(controller), ...labels);
  if (found) {
    await controller.tap(found.x, found.y);
    await delay(1_000);
    return true;
  }
  if (fallback) {
    await controller.tap(fallback.x, fallback.y);
    await delay(1_000);
    return true;
  }
  return false;
}

async function typeIntoFirstEditText(controller, value) {
  const editText = (await elements(controller)).find((item) => /edittext|editabletext/i.test(item.className || ''));
  if (editText) await controller.tap(editText.x, editText.y);
  await controller.inputText(value);
  await delay(800);
}

async function stageVideoFromUrl(controller, videoUrl) {
  const fileName = `youtube-short-${Date.now()}.mp4`;
  const path = `/sdcard/DCIM/Camera/${fileName}`;
  const quotedUrl = shellQuote(videoUrl);
  const quotedPath = shellQuote(path);
  await controller.shell(`mkdir -p /sdcard/DCIM/Camera`);
  await controller
    .shell(`toybox wget -O ${quotedPath} ${quotedUrl} || curl -L -o ${quotedPath} ${quotedUrl}`)
    .catch(() => '');
  await controller.shell(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${path}`).catch(() => '');
  return path;
}

export async function checkYouTubeLoginState(controller) {
  const launched = await controller.startApp(YOUTUBE_PACKAGE).catch(() => false);
  if (!launched) return 'unknown';
  await delay(3_000);
  await dismissPopups(controller);
  const text = textOf(await elements(controller));
  const hasHome = YOUTUBE_HOME_TEXTS.some((item) => text.includes(item.toLowerCase()));
  const hasSignIn = YOUTUBE_SIGN_IN_TEXTS.some((item) => text.includes(item.toLowerCase()));
  if (hasHome && !hasSignIn) return 'logged_in';
  if (hasSignIn) return 'logged_out';
  return 'unknown';
}

export async function loginYouTube(controller, { username = '', email = '', password = '', totpSecret = '' } = {}) {
  const identifier = String(email || username || '').trim();
  if (!identifier || !password) {
    return {
      success: false,
      status: 'missing_credentials',
      reason: !identifier ? 'missing_login_identifier' : 'missing_password'
    };
  }

  const launched = await controller.startApp(YOUTUBE_PACKAGE).catch(() => false);
  if (!launched) return { success: false, status: 'checkpointed', reason: 'youtube_launch_failed' };
  await delay(4_000);
  await dismissPopups(controller);

  const initialState = await checkYouTubeLoginState(controller);
  if (initialState === 'logged_in') {
    return { success: true, status: 'active', reason: 'session_reused', twoFactorState: '' };
  }

  let twoFactorState = '';
  await tapFirst(controller, YOUTUBE_SIGN_IN_TEXTS);
  await tapFirst(controller, YOUTUBE_EMAIL_TEXTS).catch(() => false);
  await typeIntoFirstEditText(controller, identifier);
  await tapFirst(controller, YOUTUBE_NEXT_TEXTS);
  await delay(4_000);

  let text = textOf(await elements(controller));
  const emailChallenge = challengeFromText(text);
  if (emailChallenge) return { success: false, status: 'checkpointed', reason: emailChallenge };

  await tapFirst(controller, YOUTUBE_PASSWORD_TEXTS).catch(() => false);
  await typeIntoFirstEditText(controller, password);
  await tapFirst(controller, YOUTUBE_NEXT_TEXTS);
  await delay(6_000);

  text = textOf(await elements(controller));
  const passwordChallenge = challengeFromText(text);
  if (passwordChallenge) {
    // An authenticator (TOTP) seed lets us clear 2-Step ourselves; other
    // challenges (captcha, suspicious) still require a human.
    if (passwordChallenge === 'two_factor' && totpSecret) {
      await handleYouTubeTwoFactor(controller, totpSecret);
      twoFactorState = 'totp';
    } else {
      return { success: false, status: 'checkpointed', reason: passwordChallenge };
    }
  }

  const state = await checkYouTubeLoginState(controller);
  return {
    success: state === 'logged_in',
    status: state === 'logged_in' ? 'active' : 'checkpointed',
    reason: state,
    twoFactorState
  };
}

export async function setupYouTubeChannel() {
  return {
    success: false,
    status: 'checkpointed',
    reason: 'manual_intervention'
  };
}

export async function publishYouTubeShort(
  controller,
  { videoUrl, caption = '', hashtags = [], durationSeconds = null } = {}
) {
  if (!videoUrl) throw new Error('YouTube Shorts publish requires a public videoUrl');
  if (durationSeconds !== null && Number(durationSeconds) > 60) {
    return { success: false, status: 'failed', reason: 'youtube_shorts_duration_exceeded' };
  }

  await stageVideoFromUrl(controller, videoUrl);
  const launched = await controller.startApp(YOUTUBE_PACKAGE).catch(() => false);
  if (!launched) return { success: false, status: 'checkpointed', reason: 'youtube_launch_failed' };
  await delay(4_000);
  await dismissPopups(controller);

  await tapFirst(controller, YOUTUBE_CREATE_TEXTS, YOUTUBE_CREATE_FALLBACK_POINT);
  await tapFirst(controller, YOUTUBE_UPLOAD_TEXTS);
  await controller.tap(YOUTUBE_NEWEST_MEDIA_FALLBACK_POINT.x, YOUTUBE_NEWEST_MEDIA_FALLBACK_POINT.y);
  await delay(1_500);
  await tapFirst(controller, YOUTUBE_NEXT_TEXTS);
  await tapFirst(controller, YOUTUBE_NEXT_TEXTS).catch(() => false);

  const composedCaption = captionText({ caption, hashtags });
  if (composedCaption) {
    await tapFirst(controller, YOUTUBE_CAPTION_TEXTS).catch(() => false);
    await typeIntoFirstEditText(controller, composedCaption);
  }

  const submitted = await tapFirst(controller, YOUTUBE_POST_TEXTS);
  await delay(8_000);
  const text = textOf(await elements(controller));
  const challenge = challengeFromText(text);
  if (challenge) return { success: false, status: 'checkpointed', reason: challenge };
  if (!submitted || text.includes('failed') || text.includes('try again')) {
    return { success: false, status: 'failed', reason: text || 'youtube_upload_button_not_found' };
  }
  return { success: true, status: 'posted' };
}
