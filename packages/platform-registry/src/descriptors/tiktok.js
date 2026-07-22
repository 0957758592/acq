// TikTok PlatformCapabilities descriptor (TZ §3.6/§9.4).
export const tiktokCapabilities = {
  platform: 'tiktok',
  accountKind: 'handle',
  identifierVO: 'handle',
  appPackage: 'com.zhiliaoapp.musically',
  appCatalogName: 'TikTok',
  supportedActions: ['publish', 'warmup', 'follow', 'like', 'comment'],
  onlineMethod: 'login',
  signupVia: 'native',
  maxAccountsPerDevice: 1,
  stateVocabulary: { logged_in: 'online', banned: 'banned', checkpoint: 'checkpointed', logged_out: 'logged_out' },
  scrapeTargets: ['profile', 'videos', 'followers', 'following', 'likes', 'comments', 'sounds', 'hashtags', 'trends']
};
