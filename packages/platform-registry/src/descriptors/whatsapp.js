// WhatsApp PlatformCapabilities descriptor (TZ §3.6).
// Values are grounded in the existing WhatsApp vertical:
// - appPackage/stateVocabulary mirror @acq/automation/whatsapp (constants + adapter).
// - onlineMethod 'session-import' matches the guarded bringOnline seam.
// - supportedActions is the report-only vertical (extended per platform later).
export const whatsappCapabilities = {
  platform: 'whatsapp',
  accountKind: 'phone',
  identifierVO: 'msisdn',
  appPackage: 'com.whatsapp',
  appCatalogName: 'WhatsApp',
  supportedActions: ['report'],
  onlineMethod: 'session-import',
  signupVia: 'phone',
  maxAccountsPerDevice: 1,
  // ui-flow state -> domain probe result (STATE_TO_PROBE, TZ §9.1).
  stateVocabulary: {
    logged_in: 'online',
    banned: 'banned',
    logged_out: 'logged_out'
  },
  scrapeTargets: ['group', 'contacts']
};
