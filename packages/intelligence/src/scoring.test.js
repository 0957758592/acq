import { scoreAccount, scoreTarget, selectTopN } from './scoring.js';

describe('scoreAccount (deterministic, 0..100)', () => {
  test('a bare account scores the base 50', () => {
    expect(scoreAccount({}).score).toBe(50);
  });

  test('a healthy warmed old engaging account clamps to 100', () => {
    const { score } = scoreAccount({ ageDays: 180, warmupLevel: 1, engagementRate: 0.2 });
    expect(score).toBe(100);
  });

  test('ban history is penalized', () => {
    expect(scoreAccount({ banHistory: 2 }).score).toBe(10);
  });

  test('score never goes below 0', () => {
    expect(scoreAccount({ banHistory: 5 }).score).toBe(0);
  });

  test('failures offset warmup', () => {
    expect(scoreAccount({ consecutiveFailures: 1, warmupLevel: 0.5 }).score).toBe(50);
  });

  test('reasons explain the contributions', () => {
    const { reasons } = scoreAccount({ banHistory: 1 });
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factor: 'base', delta: 50 }),
        expect.objectContaining({ factor: 'banHistory', delta: -20 })
      ])
    );
  });
});

describe('scoreTarget (campaign target quality)', () => {
  test('a large engaged reachable target scores high', () => {
    const { score } = scoreTarget({ followers: 100_000, engagementRate: 0.1, reachable: true });
    expect(score).toBeGreaterThan(50);
  });

  test('an unreachable target is heavily penalized', () => {
    const reachable = scoreTarget({ followers: 100_000, engagementRate: 0.1, reachable: true }).score;
    const unreachable = scoreTarget({ followers: 100_000, engagementRate: 0.1, reachable: false }).score;
    expect(unreachable).toBeLessThan(reachable);
  });
});

describe('selectTopN', () => {
  test('returns the n highest-scoring subjects, descending', () => {
    const subjects = [
      { id: 'a', score: 10 },
      { id: 'b', score: 90 },
      { id: 'c', score: 50 }
    ];
    expect(selectTopN(subjects, 2).map((s) => s.id)).toEqual(['b', 'c']);
  });

  test('n larger than the list returns all sorted', () => {
    expect(selectTopN([{ id: 'a', score: 1 }], 5)).toHaveLength(1);
  });
});
