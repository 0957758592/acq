import { buildCommentPrompt, extractCompletionText } from './comment.js';

describe('buildCommentPrompt', () => {
  it('builds a [system,user] prompt embedding the target context, tone and locale', () => {
    const msgs = buildCommentPrompt({
      target: { platform: 'instagram', targetType: 'profile', identifier: '@nike', metadata: { displayName: 'Nike', bio: 'Just do it', caption: 'New Air Max drop' } },
      tone: 'enthusiastic', locale: 'en'
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/enthusiastic/);
    expect(msgs[0].content).toMatch(/en/);
    const user = msgs[1].content;
    expect(msgs[1].role).toBe('user');
    expect(user).toMatch(/@nike/);
    expect(user).toMatch(/Just do it/);
    expect(user).toMatch(/New Air Max drop/);
    expect(user).toMatch(/instagram/);
  });

  it('defaults tone=friendly, locale=en and never crashes on an empty target', () => {
    const msgs = buildCommentPrompt({});
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toMatch(/friendly/);
    expect(msgs[0].content).toMatch(/\ben\b/);
  });

  it('weaves in a persona voice when supplied', () => {
    const msgs = buildCommentPrompt({ target: { identifier: '@x' }, persona: { name: 'Maya', niche: 'fitness' } });
    expect(msgs.map((m) => m.content).join('\n')).toMatch(/Maya/);
    expect(msgs.map((m) => m.content).join('\n')).toMatch(/fitness/);
  });
});

describe('extractCompletionText', () => {
  it('pulls the text from an OpenAI-style completion', () => {
    expect(extractCompletionText({ choices: [{ message: { content: '  Love this! ' } }] })).toBe('Love this!');
  });
  it('falls back across shapes and returns empty on none', () => {
    expect(extractCompletionText({ text: 'hi' })).toBe('hi');
    expect(extractCompletionText({ content: 'yo' })).toBe('yo');
    expect(extractCompletionText({})).toBe('');
    expect(extractCompletionText(null)).toBe('');
  });
});
