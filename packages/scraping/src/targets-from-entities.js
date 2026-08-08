// Map normalized scrape entities (§10.2 read-models) to target candidates for
// the callable targets DB (§3.5/§10.5): a scraped profile becomes a `profile`
// target carrying its reach metadata; followers/members/participants and message
// AUTHORS become `user` targets (the people to act on / comment to); posts become
// `post` targets carrying engagement. Deduped per (platform,targetType,identifier),
// empties dropped. Pure — the scrape worker upserts the result via targetRepo.
export function targetsFromEntities(entities = []) {
  const out = new Map();
  const push = (platform, targetType, identifier, metadata) => {
    const id = String(identifier ?? '').trim();
    if (!platform || !id) return;
    const key = `${platform}:${targetType}:${id}`;
    const existing = out.get(key);
    if (existing) {
      if (metadata) existing.metadata = { ...(existing.metadata ?? {}), ...metadata };
      return;
    }
    out.set(key, { platform, targetType, identifier: id, source: 'scrape', ...(metadata ? { metadata } : {}) });
  };

  for (const e of entities) {
    const d = e?.data ?? {};
    switch (e?.type) {
      case 'profile':
        push(e.platform, 'profile', d.handle, { displayName: d.displayName, followers: d.followers, following: d.following, postsCount: d.postsCount, verified: d.verified });
        break;
      case 'follower':
      case 'member':
      case 'participant':
        push(e.platform, 'user', d.handle);
        break;
      case 'message':
        push(e.platform, 'user', d.author);
        break;
      case 'post':
        push(e.platform, 'post', d.id, { url: d.url, caption: d.caption, likes: d.likes, comments: d.comments });
        break;
      default:
        break;
    }
  }
  return [...out.values()];
}
