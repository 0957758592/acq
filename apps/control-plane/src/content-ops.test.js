import { createFacade } from '@acq/control';
import { buildUseCases } from './use-cases.js';
import { buildValidators } from './validators.js';

function build({ targets = {}, llmText = 'Love this drop! 🔥' } = {}) {
  const llmCalls = [];
  const ctx = {
    targetRepo: { get: async (sel) => targets[sel.id] ?? targets[`${sel.platform}:${sel.targetType}:${sel.identifier}`] ?? null },
    llmFor: ({ provider, model } = {}) => ({ complete: async ({ messages }) => { llmCalls.push({ provider, model, messages }); return { choices: [{ message: { content: llmText } }] }; } })
  };
  const facade = createFacade({ useCases: buildUseCases(ctx), validators: buildValidators(), audit: { record: async () => {} } });
  return { facade, llmCalls };
}

describe('content.comment (AI comment generation) through the facade', () => {
  it('generates a comment from an inline target; readonly is forbidden', async () => {
    const { facade, llmCalls } = build();
    const forbidden = await facade.execute('content.comment', { role: 'readonly', args: { target: { platform: 'instagram', identifier: '@nike' } } });
    expect(forbidden.error.code).toBe('FORBIDDEN');
    const ok = await facade.execute('content.comment', { role: 'operator', args: { target: { platform: 'instagram', targetType: 'profile', identifier: '@nike', metadata: { bio: 'Just do it' } }, tone: 'enthusiastic' } });
    expect(ok.error).toBeNull();
    expect(ok.data.comment).toBe('Love this drop! 🔥');
    expect(ok.data.target).toEqual({ platform: 'instagram', targetType: 'profile', identifier: '@nike' });
    // the prompt embedded the target context
    expect(JSON.stringify(llmCalls[0].messages)).toMatch(/Just do it/);
    // comments default to the chat model gpt-4o-mini — NOT the system-control
    // (codex) default; an explicit model still wins.
    expect(llmCalls[0].model).toBe('gpt-4o-mini');
  });

  it('an explicit model/provider override the comment default', async () => {
    const { facade, llmCalls } = build();
    await facade.execute('content.comment', { role: 'operator', args: { target: { platform: 'ig', identifier: '@n' }, provider: 'openrouter', model: 'openai/gpt-4o-mini' } });
    expect(llmCalls[0]).toMatchObject({ provider: 'openrouter', model: 'openai/gpt-4o-mini' });
  });

  it('resolves the target from the callable targets DB by natural key', async () => {
    const targets = { 'instagram:profile:@x': { platform: 'instagram', targetType: 'profile', identifier: '@x', metadata: { caption: 'sunset run' } } };
    const { facade } = build({ targets });
    const res = await facade.execute('content.comment', { role: 'brain', args: { platform: 'instagram', targetType: 'profile', identifier: '@x' } });
    expect(res.error).toBeNull();
    expect(res.data.comment).toBeTruthy();
  });

  it('errors when the target is missing, the LLM is unwired, or the comment is empty', async () => {
    const { facade } = build({ llmText: '   ' });
    const miss = await facade.execute('content.comment', { role: 'operator', args: { platform: 'instagram', targetType: 'profile', identifier: '@ghost' } });
    expect(miss.error.code).toBe('TARGET_NOT_FOUND');
    const empty = await facade.execute('content.comment', { role: 'operator', args: { target: { platform: 'ig', identifier: '@n' } } });
    expect(empty.error.code).toBe('COMMENT_EMPTY');
  });
});
