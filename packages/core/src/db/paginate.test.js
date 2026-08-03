import { paginate, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './paginate.js';

// A chainable fake Mongoose model that records the query it was given.
function fakeModel(rows) {
  const calls = {};
  const chain = {
    find(f) { calls.filter = f; return chain; },
    sort(s) { calls.sort = s; return chain; },
    limit(n) { calls.limit = n; return chain; },
    lean: async () => rows.slice(0, calls.limit)
  };
  return { model: { find: chain.find }, calls };
}

describe('paginate — centralized cursor pagination (REQUIREM §2.5)', () => {
  it('returns a bounded page + nextCursor when there are more rows', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ _id: `id${i}`, v: i }));
    const { model, calls } = fakeModel(rows);
    const res = await paginate(model, { platform: 'telegram' }, { limit: 3 });
    expect(res.items).toHaveLength(3); // page of 3
    expect(res.nextCursor).toBe('id2'); // last item of the page
    expect(calls.filter).toMatchObject({ platform: 'telegram' });
    expect(calls.sort).toEqual({ _id: 1 });
    expect(calls.limit).toBe(4); // fetches limit+1 to detect "more"
  });

  it('returns nextCursor=null on the last page', async () => {
    const rows = [{ _id: 'a' }, { _id: 'b' }];
    const { model } = fakeModel(rows);
    const res = await paginate(model, {}, { limit: 5 });
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBeNull();
  });

  it('applies the cursor as _id > cursor to fetch the next page', async () => {
    const { model, calls } = fakeModel([{ _id: 'x' }]);
    await paginate(model, { status: 'online' }, { cursor: 'id2', limit: 10 });
    expect(calls.filter).toMatchObject({ status: 'online', _id: { $gt: 'id2' } });
  });

  it('clamps the limit to MAX_PAGE_SIZE and defaults when unset', async () => {
    const { model, calls } = fakeModel([]);
    await paginate(model, {}, { limit: 99999 });
    expect(calls.limit).toBe(MAX_PAGE_SIZE + 1);
    const { model: m2, calls: c2 } = fakeModel([]);
    await paginate(m2, {});
    expect(c2.limit).toBe(DEFAULT_PAGE_SIZE + 1);
  });
});
