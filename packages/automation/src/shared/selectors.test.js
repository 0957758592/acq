import { unionTexts, mergeActionConfig } from './selectors.js';

describe('on-device selector overrides', () => {
  it('unions built-in seeds with operator overrides (dedup, seeds preserved)', () => {
    expect(unionTexts(['Report', 'Block'], ['Report abuse', 'Report'])).toEqual(['Report', 'Block', 'Report abuse']);
    expect(unionTexts(['A'], undefined)).toEqual(['A']);
    expect(unionTexts(undefined, ['B'])).toEqual(['B']);
  });

  it('merges a per-action config with an override of the same shape', () => {
    expect(mergeActionConfig({ triggerTexts: ['Report'], confirmTexts: ['Submit'] }, { triggerTexts: ['Report abuse'] }))
      .toEqual({ triggerTexts: ['Report', 'Report abuse'], confirmTexts: ['Submit'] });
  });
});
