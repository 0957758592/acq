import { createAiActor } from './ai-actor.js';

// Fakes: an llm whose scripted replies drive observe/act, and a browser whose
// extract returns a page snapshot. No network, no real Chromium — the wiring and
// the coded seams are what we assert.
const fakeLlm = (replies) => {
  const seen = [];
  let i = 0;
  return {
    seen,
    async complete(req) {
      seen.push(req);
      return { content: replies[i++] ?? '{}', provider: 'openai', model: 'gpt-5-codex' };
    }
  };
};

const fakeBrowser = (over = {}) => ({
  async extract() {
    return over.snapshot ?? '<login form> Email [ ] Password [ ] <button>Sign in</button>';
  },
  ...over
});

describe('Stagehand-style AI actor (observe → act)', () => {
  it('fails safe with a coded seam when no llm is wired', () => {
    expect(() => createAiActor({ browser: fakeBrowser() })).toThrow(/AI_ACTOR_LLM_REQUIRED/);
  });

  it('fails safe with a coded seam when no browser is wired', () => {
    expect(() => createAiActor({ llm: fakeLlm([]) })).toThrow(/AI_ACTOR_BROWSER_REQUIRED/);
  });

  it('observe reads the live snapshot and returns LLM-proposed candidate actions', async () => {
    const llm = fakeLlm(['{"candidates":[{"action":"type","target":"email field","selector":"#email","value":"a@b.c"}]}']);
    const actor = createAiActor({ llm, browser: fakeBrowser() });
    const out = await actor.observe('s1', { goal: 'log in' });
    expect(out.goal).toBe('log in');
    expect(out.candidates[0]).toMatchObject({ action: 'type', selector: '#email' });
    // the page snapshot was actually put in front of the model
    expect(llm.seen[0].messages[1].content).toContain('login form');
  });

  it('act observes then executes the chosen action when the backend supports it', async () => {
    const executed = [];
    const browser = fakeBrowser({ act: async (id, a) => { executed.push(a); return { ok: true }; } });
    const llm = fakeLlm([
      '{"candidates":[{"action":"click","selector":"button"}]}',
      '{"action":"click","selector":"button","reason":"submit login"}'
    ]);
    const actor = createAiActor({ llm, browser });
    const out = await actor.act('s1', { goal: 'submit' });
    expect(out.executed).toBe(true);
    expect(executed[0]).toMatchObject({ action: 'click', selector: 'button' });
  });

  it('act stays HONEST (coded, not faked) when the backend has no action primitive', async () => {
    const llm = fakeLlm([
      '{"candidates":[{"action":"click","selector":"button"}]}',
      '{"action":"click","selector":"button"}'
    ]);
    const actor = createAiActor({ llm, browser: fakeBrowser() }); // no act()
    const out = await actor.act('s1', { goal: 'submit' });
    expect(out.executed).toBe(false);
    expect(out.reason).toBe('BROWSER_ACT_UNSUPPORTED');
  });

  it('maps a non-JSON model reply to a coded AI_ACTOR_RESPONSE_INVALID', async () => {
    const actor = createAiActor({ llm: fakeLlm(['sorry, I cannot do that']), browser: fakeBrowser() });
    await expect(actor.observe('s1', { goal: 'log in' })).rejects.toMatchObject({ code: 'AI_ACTOR_RESPONSE_INVALID' });
  });

  it('is HONEST when the backend cannot snapshot the page (no extract primitive)', async () => {
    // A backend without extract() (e.g. a raw CDP cloud session) can't produce a
    // snapshot — surface a coded seam, never a TypeError.
    const actor = createAiActor({ llm: fakeLlm(['{"candidates":[]}']), browser: { createSession: async () => ({}) } });
    await expect(actor.observe('s1', { goal: 'log in' })).rejects.toMatchObject({ code: 'AI_ACTOR_SNAPSHOT_UNSUPPORTED' });
  });
});
