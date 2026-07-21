// Facebook PlatformCapabilities descriptor (TZ §9.4).
export const facebookCapabilities = {
  platform: 'facebook',
  accountKind: 'email',
  identifierVO: 'email',
  appPackage: 'com.facebook.katana',
  appCatalogName: 'Facebook',
  supportedActions: ['post', 'join', 'report', 'like'],
  onlineMethod: 'login',
  signupVia: 'native',
  maxAccountsPerDevice: 1,
  stateVocabulary: {
    logged_in: 'online',
    banned: 'banned',
    checkpoint: 'checkpointed',
    logged_out: 'logged_out'
  },
  scrapeTargets: ['page', 'group', 'friends', 'members', 'posts', 'likes', 'comments']
};
