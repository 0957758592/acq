import {
  ACTION_TYPES,
  ACTION_STRATEGIES,
  actionTaskKey,
  expandActionTasks
} from './action.js';
import { DomainError } from '../errors.js';

describe('ACTION_TYPES', () => {
  test('covers the canonical action vocabulary', () => {
    expect(ACTION_TYPES).toEqual(
      expect.arrayContaining([
        'report', 'publish', 'warmup', 'follow', 'unfollow',
        'like', 'comment', 'join', 'leave', 'dm', 'view', 'scrape'
      ])
    );
  });
});

describe('actionTaskKey', () => {
  test('is campaign:account:target:actionType', () => {
    expect(actionTaskKey({ campaignId: 'c1', accountId: 'a1', target: 't1', actionType: 'follow' })).toBe(
      'c1:a1:t1:follow'
    );
  });
});

const base = { id: 'c1', actionType: 'follow', targets: ['t1', 't2'] };

describe('expandActionTasks — all-accounts-per-target (cross product)', () => {
  test('produces one task per (account, target) with the campaign actionType', () => {
    const tasks = expandActionTasks({
      campaign: { ...base, strategy: 'all-accounts-per-target' },
      onlineAccountIds: ['a1', 'a2']
    });
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => t.actionType === 'follow' && t.campaignId === 'c1')).toBe(true);
  });
});

describe('expandActionTasks — one-target-per-account (round robin)', () => {
  test('assigns each account a single rotating target', () => {
    const tasks = expandActionTasks({
      campaign: { ...base, strategy: 'one-target-per-account' },
      onlineAccountIds: ['a1', 'a2', 'a3']
    });
    expect(tasks.map((t) => t.target)).toEqual(['t1', 't2', 't1']);
  });
});

describe('expandActionTasks — n-accounts-per-target', () => {
  test('assigns n accounts to each target', () => {
    const tasks = expandActionTasks({
      campaign: { ...base, strategy: 'n-accounts-per-target', params: { n: 2 } },
      onlineAccountIds: ['a1', 'a2', 'a3', 'a4']
    });
    // 2 targets * n(2) = 4 tasks
    expect(tasks).toHaveLength(4);
    const t1 = tasks.filter((t) => t.target === 't1');
    expect(t1).toHaveLength(2);
  });
});

describe('expandActionTasks — exactly-once filtering', () => {
  test('drops tasks whose key is already done', () => {
    const doneKeys = new Set(['c1:a1:t1:follow']);
    const tasks = expandActionTasks({
      campaign: { ...base, strategy: 'all-accounts-per-target' },
      onlineAccountIds: ['a1'],
      doneKeys
    });
    expect(tasks.map((t) => t.target)).toEqual(['t2']);
  });

  test('throws ACTION_STRATEGY_UNKNOWN for an unknown strategy', () => {
    try {
      expandActionTasks({ campaign: { ...base, strategy: 'weird' }, onlineAccountIds: ['a1'] });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe('ACTION_STRATEGY_UNKNOWN');
    }
  });
});

describe('ACTION_STRATEGIES', () => {
  test('lists the three supported strategies', () => {
    expect(ACTION_STRATEGIES).toEqual(
      expect.arrayContaining(['all-accounts-per-target', 'one-target-per-account', 'n-accounts-per-target'])
    );
  });
});
