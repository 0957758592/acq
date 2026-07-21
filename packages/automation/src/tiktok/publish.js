import { getAllText } from '@acq/device-control';

import { createHumanActor } from '../human-actor.js';
import {
  TIKTOK_CAPTION_TEXTS,
  TIKTOK_CREATE_FALLBACK_POINT,
  TIKTOK_CREATE_TEXTS,
  TIKTOK_FIRST_SOUND_RESULT_FALLBACK_POINT,
  TIKTOK_NEWEST_MEDIA_FALLBACK_POINT,
  TIKTOK_NEXT_TEXTS,
  TIKTOK_POST_TEXTS,
  TIKTOK_PRIVACY_TEXTS,
  TIKTOK_SOUND_SEARCH_TEXTS,
  TIKTOK_SOUND_TEXTS,
  TIKTOK_SOUND_USE_TEXTS,
  TIKTOK_UPLOAD_TEXTS
} from './constants.js';
import { ensureTikTokForeground } from './ui-flows.js';

function actorFor(controller, actor) {
  return actor || createHumanActor({ controller });
}

function captionText({ caption = '', hashtags = [] } = {}) {
  const tags = hashtags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ');
  return [caption, tags].filter(Boolean).join('\n\n');
}

async function pushVideo(controller, videoUrl) {
  await controller.client.pushFileByUrl([controller.padCode], videoUrl, {
    customizeFilePath: '/DCIM/Camera/',
    autoInstall: 0
  });
  await controller.shell('am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera/');
}

async function emit(onEvent, message, data = {}) {
  if (!onEvent) return;
  await onEvent(message, data).catch(() => {});
}

async function tapCreate(actor) {
  const tapped = await actor.findAndTap(TIKTOK_CREATE_TEXTS, { rounds: 2 }).catch(() => false);
  if (tapped) return true;
  return actor.tapElement(TIKTOK_CREATE_FALLBACK_POINT, { allowMiss: false, afterMs: 1_200 });
}

async function selectNewestMedia(actor) {
  await actor.findAndTap(TIKTOK_UPLOAD_TEXTS, { rounds: 3 }).catch(() => false);
  await actor.pause({ meanMs: 1_300, standardDeviationMs: 320, minMs: 700, maxMs: 2_500 });
  await actor.tapElement(TIKTOK_NEWEST_MEDIA_FALLBACK_POINT, { allowMiss: false, afterMs: 1_400 });
  await actor.findAndTap(TIKTOK_NEXT_TEXTS, { rounds: 5 }).catch(() => false);
  await actor.findAndTap(TIKTOK_NEXT_TEXTS, { rounds: 5 }).catch(() => false);
}

async function selectSound(actor, soundQuery = '') {
  if (!soundQuery) return { selected: false, skipped: true };
  const opened = await actor.findAndTap(TIKTOK_SOUND_TEXTS, { rounds: 4 });
  if (!opened) return { selected: false, reason: 'sound_picker_not_found' };

  await actor.findAndTap(TIKTOK_SOUND_SEARCH_TEXTS, { rounds: 4 }).catch(() => false);
  await actor.type(soundQuery, { timeoutMs: 30_000 });
  await actor.pause({ meanMs: 2_000, standardDeviationMs: 450, minMs: 1_200, maxMs: 3_500 });
  await actor.tapElement(TIKTOK_FIRST_SOUND_RESULT_FALLBACK_POINT, { allowMiss: false, afterMs: 1_300 });
  await actor.findAndTap(TIKTOK_SOUND_USE_TEXTS, { rounds: 5 }).catch(() => false);
  await actor.findAndTap(TIKTOK_NEXT_TEXTS, { rounds: 2 }).catch(() => false);
  return { selected: true };
}

async function setPrivacy(actor, privacy = '') {
  if (!privacy) return false;
  const opened = await actor.findAndTap(TIKTOK_PRIVACY_TEXTS, { rounds: 2 }).catch(() => false);
  if (!opened) return false;
  await actor.findAndTap([privacy], { rounds: 3, exact: false }).catch(() => false);
  await actor.findAndTap(['Done', 'Save'], { rounds: 2 }).catch(() => false);
  return true;
}

export async function publishTikTokVideoUi(
  controller,
  { videoUrl, caption = '', hashtags = [], soundQuery = '', coverFrameIndex = null, privacy = '' } = {},
  { actor = null, onEvent = null } = {}
) {
  if (!videoUrl) throw new Error('TikTok UI publish requires a public videoUrl');
  const activeActor = actorFor(controller, actor);

  await emit(onEvent, 'tiktok publish: pushing video to device');
  await pushVideo(controller, videoUrl);
  const launch = await ensureTikTokForeground(controller);
  if (!launch.ok) return { success: false, status: 'failed', reason: launch.reason || 'tiktok_launch_failed' };
  await activeActor.pause({ meanMs: 4_000, standardDeviationMs: 700, minMs: 2_500, maxMs: 6_500 });

  await emit(onEvent, 'tiktok publish: opening create flow');
  await tapCreate(activeActor);
  await emit(onEvent, 'tiktok publish: selecting newest media');
  await selectNewestMedia(activeActor);

  await emit(onEvent, 'tiktok publish: selecting sound', { soundQuery });
  const sound = await selectSound(activeActor, soundQuery);
  if (soundQuery && !sound.selected) {
    return { success: false, status: 'failed', reason: sound.reason || 'sound_not_selected' };
  }
  if (sound.selected) await emit(onEvent, 'tiktok publish: sound selected', { soundQuery });

  await activeActor.findAndTap(TIKTOK_NEXT_TEXTS, { rounds: 5 }).catch(() => false);
  const composedCaption = captionText({ caption, hashtags });
  if (composedCaption) {
    await emit(onEvent, 'tiktok publish: entering caption');
    await activeActor.findAndTap(TIKTOK_CAPTION_TEXTS, { rounds: 4 }).catch(() => false);
    await activeActor.type(composedCaption, { timeoutMs: 60_000 });
  }
  if (coverFrameIndex !== null) await activeActor.pause({ meanMs: 700, standardDeviationMs: 150 });
  await setPrivacy(activeActor, privacy);

  await emit(onEvent, 'tiktok publish: submitting post');
  const posted = await activeActor.findAndTap(TIKTOK_POST_TEXTS, { rounds: 6 });
  await activeActor.pause({ meanMs: 10_000, standardDeviationMs: 1_800, minMs: 6_000, maxMs: 16_000 });

  const text = getAllText(await activeActor.elements()).join(' ').toLowerCase();
  if (!posted || text.includes('failed') || text.includes("couldn't") || text.includes('try again')) {
    return { success: false, status: 'failed', reason: text || 'post_button_not_found' };
  }
  return { success: true, status: 'posted', soundSelected: Boolean(sound.selected) };
}
