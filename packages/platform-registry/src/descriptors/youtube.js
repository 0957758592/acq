// YouTube PlatformCapabilities descriptor (TZ §3.6/§9.4).
export const youtubeCapabilities = {
  platform: 'youtube',
  accountKind: 'email',
  identifierVO: 'email',
  appPackage: 'com.google.android.youtube',
  appCatalogName: 'YouTube',
  supportedActions: ['publish', 'comment', 'like'],
  onlineMethod: 'login',
  signupVia: 'google',
  maxAccountsPerDevice: 1,
  stateVocabulary: { logged_in: 'online', banned: 'banned', checkpoint: 'checkpointed', logged_out: 'logged_out' },
  scrapeTargets: ['channel', 'videos', 'subscribers', 'comments', 'playlists']
};
