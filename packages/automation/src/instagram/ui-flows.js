import {
  delay,
  findDismissButton,
  findElement,
  findElementExact,
  getAllText,
  parseUIDump
} from '@acq/device-control';

import {
  INSTAGRAM_DISMISS_TEXTS,
  INSTAGRAM_HOME_TEXTS,
  INSTAGRAM_LAUNCHER_ACTIVITY,
  INSTAGRAM_LOGIN_TEXTS,
  INSTAGRAM_PACKAGE
} from './constants.js';

async function elements(controller) {
  return parseUIDump(await controller.getUIDump());
}

async function tapFirst(controller, labels) {
  const found = findElement(await elements(controller), ...labels);
  if (!found) return false;
  await controller.tap(found.x, found.y);
  await delay(1_000);
  return true;
}

async function tapExact(controller, labels) {
  const found = findElementExact(await elements(controller), ...labels);
  if (!found) return false;
  await controller.tap(found.x, found.y);
  await delay(1_000);
  return true;
}

async function dismissPopups(controller, rounds = 4) {
  for (let index = 0; index < rounds; index += 1) {
    const found = findDismissButton(await elements(controller), INSTAGRAM_DISMISS_TEXTS);
    if (!found) break;
    await controller.tap(found.x, found.y);
    await delay(800);
  }
}

async function typeIntoFirstEditText(controller, value) {
  const editText = (await elements(controller)).find((item) => /edittext|editabletext/i.test(item.className || ''));
  if (editText) await controller.tap(editText.x, editText.y);
  await controller.inputText(value);
  await delay(800);
}

async function typeIntoNextEditText(controller, value, index = 0) {
  const editTexts = (await elements(controller)).filter((item) => /edittext|editabletext/i.test(item.className || ''));
  const editText = editTexts[index] || editTexts[0];
  if (editText) await controller.tap(editText.x, editText.y);
  await controller.inputText(value);
  await delay(800);
}

export async function checkInstagramLoginState(controller) {
  await controller.startApp(INSTAGRAM_PACKAGE, INSTAGRAM_LAUNCHER_ACTIVITY).catch(() => {});
  await delay(3_000);
  await dismissPopups(controller);
  const text = getAllText(await elements(controller)).join(' ').toLowerCase();
  const homeHits = INSTAGRAM_HOME_TEXTS.filter((item) => text.includes(item.toLowerCase())).length;
  const hasLogin = INSTAGRAM_LOGIN_TEXTS.some((item) => text.includes(item.toLowerCase()));
  if (homeHits >= 2 && !hasLogin) return 'logged_in';
  if (hasLogin) return 'logged_out';
  return 'unknown';
}

export async function loginInstagram(controller, { username = '', password = '', emailCodeFetcher = null } = {}) {
  if (!username || !password) throw new Error('Instagram credentials are required');
  await controller.stopApp(INSTAGRAM_PACKAGE).catch(() => {});
  await controller.startApp(INSTAGRAM_PACKAGE, INSTAGRAM_LAUNCHER_ACTIVITY);
  await delay(4_000);
  await dismissPopups(controller);

  await tapFirst(controller, ['Log in', 'I already have an account']);
  await typeIntoNextEditText(controller, username, 0);
  await typeIntoNextEditText(controller, password, 1);
  await tapExact(controller, ['Log in']);
  await delay(6_000);

  let text = getAllText(await elements(controller)).join(' ').toLowerCase();
  if (text.includes('confirmation code') || text.includes('security code') || text.includes('verify')) {
    if (!emailCodeFetcher) return { success: false, status: 'checkpointed', reason: 'email_code_required' };
    const code = await emailCodeFetcher.fetchLatestCode();
    if (!code) return { success: false, status: 'checkpointed', reason: 'email_code_not_found' };
    await typeIntoFirstEditText(controller, code);
    await tapFirst(controller, ['Confirm', 'Next', 'Continue']);
    await delay(5_000);
  }

  text = getAllText(await elements(controller)).join(' ').toLowerCase();
  if (text.includes('suspended') || text.includes('disabled')) {
    return { success: false, status: 'banned', reason: text };
  }
  if (text.includes('challenge') || text.includes('help us confirm')) {
    return { success: false, status: 'checkpointed', reason: text };
  }

  const state = await checkInstagramLoginState(controller);
  return {
    success: state === 'logged_in',
    status: state === 'logged_in' ? 'active' : 'checkpointed',
    reason: state
  };
}

export async function setupInstagramProfile(controller, { displayName = '', bio = '' } = {}) {
  await controller.startApp(INSTAGRAM_PACKAGE, INSTAGRAM_LAUNCHER_ACTIVITY);
  await delay(3_000);
  await dismissPopups(controller);
  await tapFirst(controller, ['Profile']);
  await tapFirst(controller, ['Edit profile']);

  if (displayName) {
    await tapFirst(controller, ['Name']);
    await controller.clearField(40);
    await controller.inputText(displayName);
    await tapFirst(controller, ['Done', 'Save']);
  }
  if (bio) {
    await tapFirst(controller, ['Bio']);
    await controller.clearField(120);
    await controller.inputText(bio);
    await tapFirst(controller, ['Done', 'Save']);
  }

  return { success: true, status: 'active' };
}

export async function warmupInstagramAccount(controller, { swipes = 8, delayMs = 2_000 } = {}) {
  await controller.startApp(INSTAGRAM_PACKAGE, INSTAGRAM_LAUNCHER_ACTIVITY);
  await delay(3_000);
  await dismissPopups(controller);
  await tapFirst(controller, ['Reels']).catch(() => {});
  for (let index = 0; index < swipes; index += 1) {
    await delay(delayMs);
    await controller.swipe(360, 1_050, 360, 280, 450);
  }
  return { success: true, swipes };
}

export async function publishInstagramReel(controller, { videoUrl, caption = '', hashtags = [] } = {}) {
  if (!videoUrl) throw new Error('Instagram publish requires a public videoUrl');
  await controller.client.pushFileByUrl([controller.padCode], videoUrl, {
    customizeFilePath: '/DCIM/Camera/',
    autoInstall: 0
  });
  await controller.shell('am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera/');
  await controller.startApp(INSTAGRAM_PACKAGE, INSTAGRAM_LAUNCHER_ACTIVITY);
  await delay(4_000);
  await dismissPopups(controller);

  await tapFirst(controller, ['Create', 'New post', 'Reel']);
  await tapFirst(controller, ['Reel']);
  await tapFirst(controller, ['Gallery', 'Recent']);
  await tapFirst(controller, ['Next']);
  await tapFirst(controller, ['Next']);

  const captionText = [caption, hashtags.map((tag) => (String(tag).startsWith('#') ? tag : `#${tag}`)).join(' ')]
    .filter(Boolean)
    .join('\n\n');
  if (captionText) await controller.inputText(captionText);
  await tapFirst(controller, ['Share', 'Post']);
  await delay(10_000);

  const text = getAllText(await elements(controller)).join(' ').toLowerCase();
  if (text.includes('failed') || text.includes("couldn't")) {
    return { success: false, status: 'failed', reason: text };
  }
  return { success: true, status: 'posted' };
}
