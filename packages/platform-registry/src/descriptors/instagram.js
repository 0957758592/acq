// Instagram PlatformCapabilities descriptor (TZ §3.6/§9.4).
export const instagramCapabilities = {
  platform: 'instagram',
  accountKind: 'handle',
  identifierVO: 'handle',
  appPackage: 'com.instagram.android',
  appCatalogName: 'Instagram',
  supportedActions: ['publish', 'follow', 'like', 'comment', 'dm'],
  onlineMethod: 'login',
  signupVia: 'native',
  maxAccountsPerDevice: 5,
  stateVocabulary: { logged_in: 'online', banned: 'banned', checkpoint: 'checkpointed', logged_out: 'logged_out' },
  scrapeTargets: ['profile', 'followers', 'following', 'posts', 'reels', 'stories', 'likers', 'commenters', 'hashtags']
};
