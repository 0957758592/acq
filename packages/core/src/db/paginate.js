// Centralized cursor pagination (REQUIREM §2.5 "Pagination mandatory, cursor-
// based preferred" + §3.1 avoid unbounded scans). ONE implementation, used by
// every list read-model, so no operation ever loads an entire collection.
//
// Cursor = the last item's `_id` (monotonic ObjectId), so the next page is a
// bounded, index-friendly `_id > cursor` range scan — O(log n) seek, not O(n).
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function clampPageSize(limit) {
  const n = Number(limit) || DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.trunc(n)), MAX_PAGE_SIZE);
}

// Paginate a Mongoose model by `_id` cursor. Returns { items, nextCursor }.
export async function paginate(model, filter = {}, { cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  const size = clampPageSize(limit);
  const query = { ...filter, ...(cursor ? { _id: { $gt: cursor } } : {}) };
  // Fetch one extra row to know whether a further page exists.
  const rows = await model.find(query).sort({ _id: 1 }).limit(size + 1).lean();
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;
  return { items, nextCursor };
}
