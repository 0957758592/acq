import { scrapeViewModel } from './scrape.js';
const results = [
  { platform: 'telegram', type: 'message', target: 'g1', data: { author: '@ann', text: 'how to reset?' } },
  { platform: 'telegram', type: 'participant', target: 'g1', data: { handle: '@bob' } }
];
describe('scrapeViewModel', () => {
  test('per-type counts + human summaries (content+author / handle)', () => {
    const vm = scrapeViewModel(results);
    expect(vm.total).toBe(2);
    expect(vm.byType).toEqual({ message: 1, participant: 1 });
    expect(vm.rows[0].summary).toBe('@ann: how to reset?');
    expect(vm.rows[1].summary).toBe('@bob');
  });
  test('filters by type', () => {
    expect(scrapeViewModel(results, { type: 'message' }).total).toBe(1);
  });
});
