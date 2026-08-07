// LinkedIn on-device UI constants (Android app).
// ⚠️ VERIFY-BY-FACT: English SEEDS — capture real text/resource-ids from a live
// device UI dump and replace before trusting these flows in production. What is
// tested is the control flow + ban/checkpoint/confirm classification, not the
// exact strings.
export const LINKEDIN_PACKAGE = 'com.linkedin.android';
export const LINKEDIN_LAUNCHER_ACTIVITY = 'com.linkedin.android/com.linkedin.android.authenticator.LaunchActivity';

// VERIFIED against a live qXFA1 UI dump (2026-08): LinkedIn opens on a "prereg"
// screen ("Sign in with Email" / "New to LinkedIn? Join now"); tapping "Sign in with
// Email" reveals the email/password form (resource-ids below).
export const LINKEDIN_HOME_TEXTS = ['My Network', 'Notifications', 'Jobs', 'Messaging', 'Home', 'Post', 'Search'];
export const LINKEDIN_LOGIN_TEXTS = ['Sign in with Email', 'New to LinkedIn? Join now', 'Join a trusted community', 'or Join LinkedIn', 'Continue with Google', 'Forgot password?'];
// The prereg button to tap to reach the credential form.
export const LINKEDIN_PRELOGIN_TAP_TEXTS = ['Sign in with Email'];
export const LINKEDIN_BAN_TEXTS = ['account has been restricted', 'temporarily restricted', 'account restricted', 'account is restricted', 'This account is restricted'];
export const LINKEDIN_CHECKPOINT_TEXTS = ['Let’s do a quick security check', "Let's do a quick security check", 'security check', 'confirm your identity', 'Enter the code', 'verification code', 'captcha', 'unusual activity', 'Verify'];
export const LINKEDIN_DISMISS_TEXTS = ['OK', 'Continue', 'Skip', 'Not now', 'Got it', 'Allow', 'Next', 'Maybe later', 'No thanks'];

// Match the real form fields by resource-id (findElement matches resource-id too).
export const LINKEDIN_USERNAME_HINTS = ['growth_login_join_fragment_email_address', 'Email or phone', 'Email'];
export const LINKEDIN_PASSWORD_HINTS = ['growth_login_join_fragment_password', 'Password'];
export const LINKEDIN_SUBMIT_TEXTS = ['Sign in'];

// Action seeds (trigger -> confirm). Verify-by-fact against a live app build.
export const LINKEDIN_CONNECT_TEXTS = ['Connect', 'Invite to connect'];
export const LINKEDIN_CONNECT_CONFIRM_TEXTS = ['Pending', 'Invitation sent', 'Withdraw'];
export const LINKEDIN_FOLLOW_TEXTS = ['Follow'];
export const LINKEDIN_FOLLOW_CONFIRM_TEXTS = ['Following', 'Unfollow'];
export const LINKEDIN_LIKE_TEXTS = ['Like'];
export const LINKEDIN_LIKE_CONFIRM_TEXTS = ['Liked', 'Unlike'];
export const LINKEDIN_COMMENT_INPUT_TEXTS = ['Add a comment', 'Comment'];
export const LINKEDIN_COMMENT_CONFIRM_TEXTS = ['Posted', 'Comment posted'];
export const LINKEDIN_DM_INPUT_TEXTS = ['Write a message', 'Message'];
export const LINKEDIN_DM_CONFIRM_TEXTS = ['Sent', 'Delivered'];
