// WhatsApp on-device UI constants.
// ⚠️ VERIFY-BY-FACT: the selector text arrays below are best-effort English SEEDS.
// WhatsApp UI text is regionally/version-variable — capture the REAL text/resource-ids
// from a live DuoPlus WhatsApp UI dump (getUIDump/screenshot) and replace these before
// trusting ui-flows in production. Fallback coordinate points are provisional too.
export const WHATSAPP_PACKAGE = 'com.whatsapp';
export const WHATSAPP_LAUNCHER_ACTIVITY = 'com.whatsapp/com.whatsapp.HomeActivity';

export const WHATSAPP_HOME_TEXTS = ['Chats', 'Calls', 'Updates', 'Communities'];
export const WHATSAPP_CHAT_TEXTS = ['Type a message', 'Message', 'last seen', 'online'];
export const WHATSAPP_BAN_TEXTS = [
  'Your account was banned',
  'This account is not allowed to use WhatsApp',
  'Your phone number is banned from using WhatsApp'
];
export const WHATSAPP_REPORT_TEXTS = ['Report', 'Report contact', 'Report and block', 'Report business'];
export const WHATSAPP_BLOCK_REPORT_TEXTS = ['Report and block'];
// Confirmation-screen signatures — success is claimed ONLY when one of these is
// visible (see ui-flows reportTarget). VERIFY-BY-FACT seeds like the rest.
export const WHATSAPP_REPORT_CONFIRM_TEXTS = ['Reported', 'Thanks for letting us know', 'You reported', 'Report sent'];
// Overflow (⋮) menu openers: prefer the resource-id, fall back to the label.
export const WHATSAPP_OVERFLOW_RESOURCE_IDS = ['com.whatsapp:id/menuitem_overflow'];
export const WHATSAPP_OVERFLOW_TEXTS = ['More options'];
export const WHATSAPP_DISMISS_TEXTS = ['OK', 'Continue', 'Not now', 'Allow', 'Cancel', 'Agree and continue'];

// Provisional fallback tap points (portrait) — used only when a selector isn't found.
export const WHATSAPP_OVERFLOW_FALLBACK_POINT = { x: 1_000, y: 130 };
export const WHATSAPP_REPORT_FALLBACK_POINT = { x: 540, y: 900 };
