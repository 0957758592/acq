import { createHash } from 'node:crypto';

import { domainError } from '@acq/engine-domain';

// Content-pool anti-repeat selection (TZ §9.8): a stable content key lets the
// engine avoid re-posting the same caption/media across accounts, and pick only
// fresh items. Pure and deterministic.
export function contentKey(content = {}) {
  const material = JSON.stringify({
    caption: content.caption ?? '',
    mediaRef: content.mediaRef ?? '',
    hashtags: content.hashtags ?? []
  });
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

export function dedupeContent(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = contentKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function pickFreshContent({ pool = [], usedKeys = new Set(), count = 1 } = {}) {
  const fresh = dedupeContent(pool).filter((item) => !usedKeys.has(contentKey(item)));
  if (fresh.length === 0) {
    throw domainError('CONTENT_EXHAUSTED', 'no fresh content left in the pool');
  }
  return fresh.slice(0, count);
}
