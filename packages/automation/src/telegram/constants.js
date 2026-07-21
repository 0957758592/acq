// Telegram on-device UI constants.
// ⚠️ VERIFY-BY-FACT: the selector text arrays below are best-effort English
// SEEDS. Telegram UI text is locale/version-variable — capture the REAL
// text/resource-ids from a live device UI dump (getUIDump) and replace these
// before trusting ui-flows in production.
export const TELEGRAM_PACKAGE = 'org.telegram.messenger';
export const TELEGRAM_LAUNCHER_ACTIVITY = 'org.telegram.messenger/org.telegram.ui.LaunchActivity';

export const TELEGRAM_HOME_TEXTS = ['Chats', 'Contacts', 'Calls', 'Settings', 'New Message'];
export const TELEGRAM_LOGIN_TEXTS = ['Start Messaging', 'Your phone number', 'Sign in', 'Continue on'];
export const TELEGRAM_BAN_TEXTS = [
  'This account has been banned',
  'Your account was limited',
  'account has been blocked',
  'Too many attempts'
];
export const TELEGRAM_CHECKPOINT_TEXTS = ['Enter the code', 'Two-Step Verification', 'confirm your identity'];
export const TELEGRAM_DISMISS_TEXTS = ['OK', 'Continue', 'Not now', 'Allow', 'Cancel', 'GOT IT'];

// Per-action selector + confirmation seeds (VERIFY-BY-FACT).
export const TELEGRAM_JOIN_TEXTS = ['JOIN', 'Join Channel', 'Join Group', 'JOIN GROUP'];
export const TELEGRAM_JOIN_CONFIRM_TEXTS = ['Mute', 'Unmute', 'Message', 'joined', 'Leave Channel'];

export const TELEGRAM_REPORT_TEXTS = ['Report', 'Report Spam', 'Report and leave'];
export const TELEGRAM_REPORT_CONFIRM_TEXTS = ['Thank you', 'Reported', 'report received'];

export const TELEGRAM_DM_INPUT_TEXTS = ['Message', 'Write a message', 'Type a message'];
export const TELEGRAM_DM_CONFIRM_TEXTS = ['Seen', 'Delivered', 'Sent'];

export const TELEGRAM_VIEW_CONFIRM_TEXTS = ['views', 'Mute', 'Message'];
