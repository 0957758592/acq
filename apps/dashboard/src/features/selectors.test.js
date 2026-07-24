import { selectorsViewModel } from './selectors.js';
describe('selectorsViewModel', () => {
  test('per-platform rows with tuned selector groups', () => {
    const vm = selectorsViewModel([
      { platform: 'telegram', selectors: { actions: { report: { triggerTexts: ['Report abuse'] } } } },
      { platform: 'discord', selectors: { submitTexts: ['Log In'] } }
    ]);
    expect(vm.total).toBe(2);
    expect(vm.rows[0]).toMatchObject({ platform: 'telegram', groups: ['actions'] });
    expect(vm.rows[1].groups).toEqual(['submitTexts']);
  });
});
