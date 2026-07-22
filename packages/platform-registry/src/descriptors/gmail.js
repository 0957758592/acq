// Gmail PlatformCapabilities descriptor (TZ §7.2/§9.4). Gmail is the signup
// anchor (Continue-with-Google) and the verification-code reader; it does not
// run social actions.
export const gmailCapabilities = {
  platform: 'gmail',
  accountKind: 'email',
  identifierVO: 'email',
  appPackage: 'com.google.android.gm',
  appCatalogName: 'Gmail',
  supportedActions: ['read-code'],
  onlineMethod: 'login',
  signupVia: 'native',
  maxAccountsPerDevice: 1,
  stateVocabulary: {
    logged_in: 'online',
    banned: 'banned',
    checkpoint: 'checkpointed',
    logged_out: 'logged_out'
  },
  scrapeTargets: ['threads', 'contacts']
};
