import {
  checkInstagramLoginState,
  loginInstagram,
  publishInstagramReel,
  setupInstagramProfile,
  warmupInstagramAccount
} from './ui-flows.js';

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

  publish(controller, post, account, opts = {}) {
    return publishInstagramReel(controller, publishPayload(post, opts));
  }
};
