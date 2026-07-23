import { buildActionRunner } from '../shared/action-runner.js';

import {
  checkYouTubeLoginState,
  loginYouTube,
  publishYouTubeShort,
  setupYouTubeChannel,
  warmupYouTubeAccount
} from './ui-flows.js';
import {
  YOUTUBE_BAN_TEXTS,
  YOUTUBE_CHECKPOINT_TEXTS,
  YOUTUBE_DISMISS_TEXTS,
  YOUTUBE_LIKE_TEXTS,
  YOUTUBE_LIKE_CONFIRM_TEXTS,
  YOUTUBE_COMMENT_TEXTS,
  YOUTUBE_COMMENT_CONFIRM_TEXTS
} from './constants.js';

function credentialsFrom(account = {}) {
  return {
    username: account.credentials?.username,
    email: account.credentials?.email,
    password: account.credentials?.password,
    totpSecret: account.credentials?.totpSecret
  };
}

function publishPayload(post = {}, opts = {}) {
  const media = opts.stagedMedia || post.media || {};
  const publishOptions = post.publishOptions || {};
  return {
    videoUrl: media.publicUrl || media.sourceUrl || '',
    durationSeconds: media.durationSeconds ?? post.media?.durationSeconds ?? null,
    caption: publishOptions.caption,
    hashtags: publishOptions.hashtags || []
  };
}

export const youtubeAdapter = {
  platform: 'youtube',

  login(controller, account) {
    return loginYouTube(controller, credentialsFrom(account));
  },

  setupProfile(controller, account) {
    return setupYouTubeChannel(controller, account.profile || {});
  },

  async healthCheck(controller) {
    const state = await checkYouTubeLoginState(controller);
    return {
      success: state === 'logged_in',
      status: state === 'logged_in' ? 'active' : 'cooldown',
      state,
      reason: state
    };
  },

  warmup(controller, account, opts = {}) {
    return warmupYouTubeAccount(controller, opts);
  },

  // Unified action runner (TZ §9.4): publish + like/comment.
  runAction: buildActionRunner({
    platform: 'youtube',
    banTexts: YOUTUBE_BAN_TEXTS,
    checkpointTexts: YOUTUBE_CHECKPOINT_TEXTS,
    dismissTexts: YOUTUBE_DISMISS_TEXTS,
    actions: {
      like: { triggerTexts: YOUTUBE_LIKE_TEXTS, confirmTexts: YOUTUBE_LIKE_CONFIRM_TEXTS },
      comment: { triggerTexts: YOUTUBE_COMMENT_TEXTS, confirmTexts: YOUTUBE_COMMENT_CONFIRM_TEXTS }
    },
    special: { publish: (controller, post, account, opts = {}) => publishYouTubeShort(controller, publishPayload(post, opts)) }
  })
};
