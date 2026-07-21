import { PROVIDERS } from './engine-device.model.js';

describe('EngineDevice PROVIDERS enum', () => {
  test('includes every device provider with a built adapter', () => {
    expect(PROVIDERS).toEqual(expect.arrayContaining(['vmos', 'duoplus', 'geelark']));
  });
});
