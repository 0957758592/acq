export const TIKTOK_PACKAGE = 'com.zhiliaoapp.musically';
export const TIKTOK_PACKAGES = [TIKTOK_PACKAGE, 'com.ss.android.ugc.trill'];
export const TIKTOK_LAUNCHER_ACTIVITY =
  'com.zhiliaoapp.musically/com.ss.android.ugc.aweme.splash.SplashActivity';

export const TIKTOK_TASK_TYPE = {
  LOGIN: 1,
  EDIT_PROFILE: 2,
  SEARCH_VIDEOS: 3,
  RANDOM_BROWSE: 4,
  PUBLISH_VIDEO: 5,
  PUBLISH_CAROUSEL: 6,
  LIKE_COMMENT: 7,
  LIVE_HEATING: 8
};

export const TIKTOK_TASK_STATUS = {
  ALL_FAILED: -1,
  PARTIAL_FAILED: -2,
  CANCELLED: -3,
  TIMED_OUT: -4,
  ERROR: -5,
  PENDING: 1,
  EXECUTING: 2,
  COMPLETED: 3
};

export const TIKTOK_DISMISS_TEXTS = [
  "Don't allow",
  'DON’T ALLOW',
  'DENY',
  'Not Now',
  'Skip',
  'Maybe later',
  'Dismiss',
  'Close'
];

export const TIKTOK_PROFILE_TEXTS = ['Profile', 'Me'];
export const TIKTOK_LOGIN_TEXTS = ['Log in', 'Login', 'Already have an account'];
export const TIKTOK_LOGIN_OPTION_TEXTS = [
  'Use phone / email / username',
  'Use email or username',
  'Use phone',
  'email',
  'username'
];
export const TIKTOK_EMAIL_USERNAME_TAB_TEXTS = ['Email / Username', 'Email or username', 'Username', 'Email'];
export const TIKTOK_CONTINUE_TEXTS = ['Continue', 'Next'];
export const TIKTOK_NEXT_TEXTS = TIKTOK_CONTINUE_TEXTS;
export const TIKTOK_PASSWORD_SCREEN_TEXTS = ['Forgot password', 'Forgot your password', 'Password'];
export const TIKTOK_SUBMIT_LOGIN_TEXTS = ['Log in', 'Login'];
export const TIKTOK_VERIFICATION_TEXTS = ['verification code', 'enter the code', 'enter code'];
export const TIKTOK_SAVE_TEXTS = ['Save', 'Done'];
export const TIKTOK_EDIT_PROFILE_TEXTS = ['Edit profile'];
export const TIKTOK_PROFILE_NAME_TEXTS = ['Name'];
export const TIKTOK_PROFILE_BIO_TEXTS = ['Bio'];
export const TIKTOK_CHANGE_PHOTO_TEXTS = ['Change photo', 'Edit photo', 'Photo'];
export const TIKTOK_SELECT_FROM_GALLERY_TEXTS = ['Select from Gallery', 'Upload from device', 'Photos'];

export const TIKTOK_CREATE_TEXTS = ['Create', 'Post', '+'];
export const TIKTOK_UPLOAD_TEXTS = ['Upload', 'Gallery', 'Photos'];
export const TIKTOK_SOUND_TEXTS = ['Add sound', 'Sounds', 'Sound'];
export const TIKTOK_SOUND_SEARCH_TEXTS = ['Search', 'Search sounds'];
export const TIKTOK_SOUND_USE_TEXTS = ['Use', 'Add', 'Check', 'Done'];
export const TIKTOK_CAPTION_TEXTS = ['Describe your video', 'Add description', 'caption'];
export const TIKTOK_PRIVACY_TEXTS = ['Who can watch this video', 'Privacy settings', 'Everyone', 'Friends', 'Only you'];
export const TIKTOK_POST_TEXTS = ['Post', 'Share'];

export const TIKTOK_CREATE_FALLBACK_POINT = { x: 360, y: 1_185 };
export const TIKTOK_NEWEST_MEDIA_FALLBACK_POINT = { x: 115, y: 330 };
export const TIKTOK_FIRST_SOUND_RESULT_FALLBACK_POINT = { x: 360, y: 330 };
