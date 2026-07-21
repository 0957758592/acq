import { checkYouTubeLoginState, loginYouTube, publishYouTubeShort, setupYouTubeChannel } from './ui-flows.js';

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

  warmup() {
    return { success: true, status: 'active', skipped: true };
  },

  publish(controller, post, account, opts = {}) {
    return publishYouTubeShort(controller, publishPayload(post, opts));
  }
};
