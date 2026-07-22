import { EngineActionTask, ACTION_TASK_STATUSES } from './engine-action-task.model.js';

describe('EngineActionTask model', () => {
  it('validates clean with the natural key and defaults status pending', () => {
    const doc = new EngineActionTask({ campaignId: 'c1', accountId: 'a1', target: 't1', actionType: 'follow' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe('pending');
    expect(doc.attempts).toBe(0);
  });

  it('requires all four natural-key fields', () => {
    expect(new EngineActionTask({ campaignId: 'c1' }).validateSync()).toBeDefined();
  });

  it('rejects an unknown status', () => {
    const doc = new EngineActionTask({ campaignId: 'c1', accountId: 'a1', target: 't1', actionType: 'follow', status: 'weird' });
    expect(doc.validateSync()).toBeDefined();
  });

  it('enforces a unique index on the exactly-once natural key', () => {
    const unique = EngineActionTask.schema
      .indexes()
      .some(([f, o]) => f.campaignId === 1 && f.accountId === 1 && f.target === 1 && f.actionType === 1 && o?.unique);
    expect(unique).toBe(true);
  });

  it('exposes the task statuses', () => {
    expect(ACTION_TASK_STATUSES).toEqual(expect.arrayContaining(['pending', 'running', 'done', 'failed']));
  });
});
