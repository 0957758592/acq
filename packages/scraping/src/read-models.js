import { domainError } from '@acq/engine-domain';

// Normalized scrape read-models (TZ §10.2) with stable natural keys for
// idempotent upsert (EngineScrapeResult unique per platform:type:...:entityId,
// §12.2). Every tier's raw output is reduced to these canonical shapes.

// Normalize any handle-ish value (bare string or already @-prefixed) to `@lower`.
function toHandle(value) {
  const h = String(value ?? '').trim();
  if (!h) return '';
  return h.startsWith('@') ? h.toLowerCase() : `@${h.toLowerCase()}`;
}

function handleOf(raw) {
  return toHandle(raw.handle ?? raw.username ?? raw.user);
}

// A message's author may arrive as a nested object (`author`/`from`/`sender`) or
// as a bare handle string — resolve either to a normalized handle.
function authorOf(raw) {
  const a = raw.author ?? raw.from ?? raw.sender;
  if (a && typeof a === 'object') return handleOf(a);
  return a != null ? toHandle(a) : handleOf(raw);
}

export function naturalKey(entity) {
  const { platform, type, data } = entity;
  switch (type) {
    case 'profile':
      return `${platform}:profile:${data.handle}`;
    case 'follower':
      return `${platform}:follower:${data.of}:${data.handle}`;
    case 'post':
      return `${platform}:post:${data.id}`;
    case 'member':
      return `${platform}:member:${data.group}:${data.handle}`;
    case 'participant':
      return `${platform}:participant:${data.group}:${data.handle}`;
    case 'message':
      return `${platform}:message:${data.group}:${data.id}`;
    default:
      throw domainError('SCRAPE_TARGET_UNSUPPORTED', `no natural key for type '${type}'`);
  }
}

function wrap(platform, type, data) {
  const entity = { platform, type, data };
  return { ...entity, key: naturalKey(entity) };
}

function profile(platform, raw) {
  return wrap(platform, 'profile', {
    handle: handleOf(raw),
    displayName: raw.display_name ?? raw.displayName ?? raw.name ?? '',
    bio: raw.bio ?? raw.description ?? '',
    followers: raw.followers ?? raw.followerCount ?? 0,
    following: raw.following ?? raw.followingCount ?? 0,
    postsCount: raw.postsCount ?? raw.posts ?? 0,
    verified: Boolean(raw.verified)
  });
}

function follower(platform, of, raw) {
  return wrap(platform, 'follower', { of, handle: handleOf(raw) });
}

function post(platform, raw) {
  return wrap(platform, 'post', {
    id: String(raw.id ?? raw.pk ?? raw.shortcode ?? ''),
    url: raw.url ?? '',
    caption: raw.caption ?? raw.text ?? '',
    likes: raw.likes ?? raw.likeCount ?? 0,
    comments: raw.comments ?? raw.commentCount ?? 0,
    createdAt: raw.createdAt ?? raw.taken_at ?? null
  });
}

// Group-user shape shared by `members` (the roster) and `participants` (distinct
// users active in the group) — same fields, distinct entity type/key.
function groupUser(platform, type, group, raw) {
  return wrap(platform, type, { group, handle: handleOf(raw), role: raw.role ?? 'member' });
}

// A group message: the CONTENT (text/questions) plus WHO wrote it (author) — the
// pair that feeds intelligence and yields the set of users who commented.
function message(platform, group, raw) {
  return wrap(platform, 'message', {
    group,
    id: String(raw.id ?? raw.message_id ?? raw.messageId ?? ''),
    author: authorOf(raw),
    text: raw.text ?? raw.message ?? raw.caption ?? '',
    ts: raw.ts ?? raw.date ?? raw.createdAt ?? null,
    replyToId: raw.replyToId ?? raw.reply_to ?? raw.replyTo ?? null
  });
}

const HANDLERS = {
  profile: ({ platform, rawItems }) => rawItems.map((raw) => profile(platform, raw)),
  followers: ({ platform, target, rawItems }) => rawItems.map((raw) => follower(platform, target, raw)),
  following: ({ platform, target, rawItems }) => rawItems.map((raw) => follower(platform, target, raw)),
  posts: ({ platform, rawItems }) => rawItems.map((raw) => post(platform, raw)),
  members: ({ platform, target, rawItems }) => rawItems.map((raw) => groupUser(platform, 'member', target, raw)),
  participants: ({ platform, target, rawItems }) => rawItems.map((raw) => groupUser(platform, 'participant', target, raw)),
  messages: ({ platform, target, rawItems }) => rawItems.map((raw) => message(platform, target, raw))
};

export function normalizeEntities({ platform, targetType, target, rawItems = [] }) {
  const handler = HANDLERS[targetType];
  if (!handler) {
    throw domainError('SCRAPE_TARGET_UNSUPPORTED', `unsupported scrape targetType '${targetType}'`);
  }
  // Stamp the scraped target on every entity so results record which
  // group/profile/channel they belong to (the repo persists `entity.target`,
  // enabling per-target reads and cleanup — §10.3).
  return handler({ platform, target, rawItems }).map((entity) => ({ ...entity, target }));
}
