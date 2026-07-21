// Telegram PlatformCapabilities descriptor (TZ §9.4). Second platform, proves
// the generalization: phone-identified accounts, session-import/login online,
// generic actions (join/dm/report/view), rich scrape targets.
export const telegramCapabilities = {
  platform: 'telegram',
  accountKind: 'phone',
  identifierVO: 'msisdn',
  appPackage: 'org.telegram.messenger',
  appCatalogName: 'Telegram',
  supportedActions: ['join', 'dm', 'report', 'view'],
  onlineMethod: 'session-import',
  signupVia: 'phone',
  maxAccountsPerDevice: 1,
  stateVocabulary: {
    logged_in: 'online',
    banned: 'banned',
    checkpoint: 'checkpointed',
    logged_out: 'logged_out'
  },
  scrapeTargets: ['channel', 'group', 'members', 'messages', 'participants', 'contacts']
};
