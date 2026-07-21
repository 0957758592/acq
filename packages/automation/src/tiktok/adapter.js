import { publishTikTokVideoUi } from './publish.js';
import { checkTikTokLoginState, loginTikTok, setupTikTokProfile } from './ui-flows.js';
import { warmupTikTokAccount } from './vmos-tasks.js';

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

  publish(controller, post, account, opts = {}) {
    return publishTikTokVideoUi(controller, publishPayload(post, opts), {
      actor: opts.actor,
      onEvent: opts.onEvent
    });
  }
};
