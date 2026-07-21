// Discord PlatformCapabilities descriptor (TZ §9.4). Email/token-identified
// accounts, login online, actions join/dm/report, server/channel/member scrape.
export const discordCapabilities = {
  platform: 'discord',
  accountKind: 'email',
  identifierVO: 'email',
  appPackage: 'com.discord',
  appCatalogName: 'Discord',
  supportedActions: ['join', 'dm', 'report'],
  onlineMethod: 'login',
  signupVia: 'native',
  maxAccountsPerDevice: 1,
  stateVocabulary: {
    logged_in: 'online',
    banned: 'banned',
    checkpoint: 'checkpointed',
    logged_out: 'logged_out'
  },
  scrapeTargets: ['server', 'channel', 'members', 'roles', 'messages']
};
