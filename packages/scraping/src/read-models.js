import { domainError } from '@acq/engine-domain';

// Normalized scrape read-models (TZ §10.2) with stable natural keys for
// idempotent upsert (EngineScrapeResult unique per platform:type:...:entityId,
// §12.2). Every tier's raw output is reduced to these canonical shapes.

function handleOf(raw) {
  const h = String(raw.handle ?? raw.username ?? raw.user ?? '').trim();
  if (!h) return '';
  return h.startsWith('@') ? h.toLowerCase() : `@${h.toLowerCase()}`;
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

function member(platform, group, raw) {
  return wrap(platform, 'member', { group, handle: handleOf(raw), role: raw.role ?? 'member' });
}

const HANDLERS = {
  profile: ({ platform, rawItems }) => rawItems.map((raw) => profile(platform, raw)),
  followers: ({ platform, target, rawItems }) => rawItems.map((raw) => follower(platform, target, raw)),
  following: ({ platform, target, rawItems }) => rawItems.map((raw) => follower(platform, target, raw)),
  posts: ({ platform, rawItems }) => rawItems.map((raw) => post(platform, raw)),
  members: ({ platform, target, rawItems }) => rawItems.map((raw) => member(platform, target, raw))
};

export function normalizeEntities({ platform, targetType, target, rawItems = [] }) {
  const handler = HANDLERS[targetType];
  if (!handler) {
    throw domainError('SCRAPE_TARGET_UNSUPPORTED', `unsupported scrape targetType '${targetType}'`);
  }
  return handler({ platform, target, rawItems });
}
