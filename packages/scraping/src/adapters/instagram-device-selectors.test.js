import { createInstagramDeviceSelectors } from './instagram-device-selectors.js';

const node = (resourceId, text) => ({ resourceId, text, className: 'android.widget.TextView', x: 100, y: 200 });

describe('createInstagramDeviceSelectors (on-device T2 UI-dump extractor)', () => {
  it('extracts one {username} row per username cell in a list dump', () => {
    const { extractRows } = createInstagramDeviceSelectors();
    const rows = extractRows([
      node('com.instagram.android:id/follow_list_username', 'alice'),
      node('com.instagram.android:id/row_user_username', 'bob'),
      node('com.instagram.android:id/row_user_primary_name', 'Bob Smith'), // display name, not username
      node('com.instagram.android:id/action_bar_title', 'Followers') // chrome, ignored
    ]);
    expect(rows).toEqual([{ username: 'alice' }, { username: 'bob' }]);
  });

  it('ignores nodes with no matching resource-id or empty text (verify-by-fact, no fabrication)', () => {
    const { extractRows } = createInstagramDeviceSelectors();
    expect(extractRows([node('some:id/row_user_username', ''), node('other:id/label', 'x'), {}])).toEqual([]);
  });

  it('keyOf dedups by username across overlapping scroll windows', () => {
    const { keyOf } = createInstagramDeviceSelectors();
    expect(keyOf({ username: 'alice' })).toBe('alice');
  });

  it('username id fragments are overridable (no hardcode)', () => {
    const { extractRows } = createInstagramDeviceSelectors({ usernameIds: ['handle_cell'] });
    expect(extractRows([node('x:id/handle_cell', 'carol'), node('x:id/row_user_username', 'dave')])).toEqual([{ username: 'carol' }]);
  });
});
