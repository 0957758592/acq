// Instagram on-device (T2) UI-dump extractor (TZ §10.1 T2). Harvests the app-only
// data the web never exposes — the FULL follower / following / liker roster — by
// reading usernames off the list screen's UI dump. Feeds createDeviceScrapeAdapter
// (dump → extractRows → scroll → dedup). The username cell is matched by its
// resource-id fragment (real com.instagram.android ids), verify-by-fact and
// OVERRIDABLE (tune to the live app build); a mismatch yields empty rows, never
// fabricated data. Rows are { username } so the followers/following/members
// read-models normalize them directly (handleOf).
const DEFAULT_USERNAME_IDS = ['follow_list_username', 'row_user_username', 'username'];

export function createInstagramDeviceSelectors({ usernameIds = DEFAULT_USERNAME_IDS } = {}) {
  const matches = (rid) => {
    const id = String(rid || '').toLowerCase();
    return usernameIds.some((f) => id.includes(String(f).toLowerCase()));
  };
  return {
    extractRows(nodes = []) {
      return nodes
        .filter((n) => n && matches(n.resourceId) && String(n.text || '').trim())
        .map((n) => ({ username: String(n.text).trim() }));
    },
    keyOf: (row) => row.username
  };
}
