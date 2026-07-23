import { buildActionRunner } from '../shared/action-runner.js';

import { publishTikTokVideoUi } from './publish.js';
import { checkTikTokLoginState, loginTikTok, setupTikTokProfile } from './ui-flows.js';
import { warmupTikTokAccount } from './vmos-tasks.js';
import {
  TIKTOK_BAN_TEXTS,
  TIKTOK_CHECKPOINT_TEXTS,
  TIKTOK_DISMISS_TEXTS,
  TIKTOK_FOLLOW_TEXTS,
  TIKTOK_FOLLOW_CONFIRM_TEXTS,
  TIKTOK_LIKE_TEXTS,
  TIKTOK_LIKE_CONFIRM_TEXTS,
  TIKTOK_COMMENT_TEXTS,
  TIKTOK_COMMENT_CONFIRM_TEXTS
} from './constants.js';

function credentialsFrom(account = {}, opts = {}) {
  return {
    username: account.credentials?.username,
    email: account.credentials?.email,
    password: account.credentials?.password,
    totpSecret: account.credentials?.totpSecret,
    emailCodeFetcher: opts.emailCodeFetcher
  };
}

function publishPayload(post = {}, opts = {}) {
  const media = opts.stagedMedia || post.media || {};
  const publishOptions = post.publishOptions || {};
  return {
    videoUrl: media.publicUrl || media.sourceUrl || '',
    caption: publishOptions.caption,
    hashtags: publishOptions.hashtags || [],
    coverFrameIndex: publishOptions.coverFrameIndex,
    soundQuery: publishOptions.soundQuery || '',
    privacy: publishOptions.privacy || ''
  };
}

export const tiktokAdapter = {
  platform: 'tiktok',

  login(controller, account, opts = {}) {
    return loginTikTok(controller, credentialsFrom(account, opts), { actor: opts.actor });
  },

  setupProfile(controller, account, opts = {}) {
    return setupTikTokProfile(controller, account.profile || {}, { actor: opts.actor });
  },

  async healthCheck(controller, account, opts = {}) {
    const state = await checkTikTokLoginState(controller, { actor: opts.actor });
    return {
      success: state === 'logged_in',
      status: state === 'logged_in' ? 'active' : 'cooldown',
      state,
      reason: state
    };
  },

  warmup(controller, account, opts = {}) {
    return warmupTikTokAccount({
      client: opts.provider?.client,
      padCode: opts.providerDeviceId,
      ...(account.health?.warmupConfig || {})
    });
  },

  // Unified action runner (TZ §9.4): publish + follow/like/comment.
  runAction: buildActionRunner({
    platform: 'tiktok',
    banTexts: TIKTOK_BAN_TEXTS,
    checkpointTexts: TIKTOK_CHECKPOINT_TEXTS,
    dismissTexts: TIKTOK_DISMISS_TEXTS,
    actions: {
      follow: { triggerTexts: TIKTOK_FOLLOW_TEXTS, confirmTexts: TIKTOK_FOLLOW_CONFIRM_TEXTS },
      like: { triggerTexts: TIKTOK_LIKE_TEXTS, confirmTexts: TIKTOK_LIKE_CONFIRM_TEXTS },
      comment: { triggerTexts: TIKTOK_COMMENT_TEXTS, confirmTexts: TIKTOK_COMMENT_CONFIRM_TEXTS }
    },
    special: {
      publish: (controller, post, account, opts = {}) => publishTikTokVideoUi(controller, publishPayload(post, opts), { actor: opts.actor, onEvent: opts.onEvent })
    }
  })
};
