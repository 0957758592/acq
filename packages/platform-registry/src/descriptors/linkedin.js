// LinkedIn PlatformCapabilities descriptor (TZ §3.6/§9.4).
export const linkedinCapabilities = {
  platform: 'linkedin',
  accountKind: 'handle',
  identifierVO: 'handle',
  appPackage: 'com.linkedin.android',
  appCatalogName: 'LinkedIn',
  supportedActions: ['publish', 'follow', 'like', 'comment', 'dm', 'connect'],
  onlineMethod: 'login',
  signupVia: 'native',
  maxAccountsPerDevice: 3,
  stateVocabulary: { logged_in: 'online', banned: 'banned', checkpoint: 'checkpointed', logged_out: 'logged_out' },
  scrapeTargets: ['profile', 'connections', 'posts', 'company', 'search']
};
