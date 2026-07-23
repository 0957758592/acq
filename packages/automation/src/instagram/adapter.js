import { buildActionRunner } from '../shared/action-runner.js';

import {
  checkInstagramLoginState,
  loginInstagram,
  publishInstagramReel,
  setupInstagramProfile,
  warmupInstagramAccount
} from './ui-flows.js';
import {
  INSTAGRAM_BAN_TEXTS,
  INSTAGRAM_CHECKPOINT_TEXTS,
  INSTAGRAM_DISMISS_TEXTS,
  INSTAGRAM_FOLLOW_TEXTS,
  INSTAGRAM_FOLLOW_CONFIRM_TEXTS,
  INSTAGRAM_LIKE_TEXTS,
  INSTAGRAM_LIKE_CONFIRM_TEXTS,
  INSTAGRAM_COMMENT_TEXTS,
  INSTAGRAM_COMMENT_CONFIRM_TEXTS
} from './constants.js';

function credentialsFrom(account = {}, opts = {}) {
  return {
    username: account.credentials?.username,
    email: account.credentials?.email,
    password: account.credentials?.password,
    emailCodeFetcher: opts.emailCodeFetcher
  };
}

function publishPayload(post = {}, opts = {}) {
  const media = opts.stagedMedia || post.media || {};
  const publishOptions = post.publishOptions || {};
  return {
    videoUrl: media.publicUrl || media.sourceUrl || '',
    caption: publishOptions.caption,
    hashtags: publishOptions.hashtags || []
  };
}

export const instagramAdapter = {
  platform: 'instagram',

  login(controller, account, opts = {}) {
    return loginInstagram(controller, credentialsFrom(account, opts));
  },

  setupProfile(controller, account) {
    return setupInstagramProfile(controller, account.profile || {});
  },

  async healthCheck(controller) {
    const state = await checkInstagramLoginState(controller);
    return {
      success: state === 'logged_in',
      status: state === 'logged_in' ? 'active' : 'cooldown',
      state,
      reason: state
    };
  },

  warmup(controller, account) {
    return warmupInstagramAccount(controller, account.health?.warmupConfig || {});
  },

  // Unified action runner (TZ §9.4): publish + follow/like/comment. The generic
  // engine dispatches every campaign action here; selectors are verify-by-fact.
  runAction: buildActionRunner({
    platform: 'instagram',
    banTexts: INSTAGRAM_BAN_TEXTS,
    checkpointTexts: INSTAGRAM_CHECKPOINT_TEXTS,
    dismissTexts: INSTAGRAM_DISMISS_TEXTS,
    actions: {
      follow: { triggerTexts: INSTAGRAM_FOLLOW_TEXTS, confirmTexts: INSTAGRAM_FOLLOW_CONFIRM_TEXTS },
      like: { triggerTexts: INSTAGRAM_LIKE_TEXTS, confirmTexts: INSTAGRAM_LIKE_CONFIRM_TEXTS },
      comment: { triggerTexts: INSTAGRAM_COMMENT_TEXTS, confirmTexts: INSTAGRAM_COMMENT_CONFIRM_TEXTS }
    },
    special: { publish: (controller, post, account, opts = {}) => publishInstagramReel(controller, publishPayload(post, opts)) }
  })
};
