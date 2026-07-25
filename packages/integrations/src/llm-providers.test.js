import { LLM_PROVIDERS, listLlmProviders, createLlmClient, resolveLlmModel } from './llm-providers.js';

function captureFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(response) };
  };
  return { fetchImpl, calls };
}

describe('LLM provider registry (pluggable AI backends)', () => {
  it('ships the required providers with model catalogs and a default model each', () => {
    const ids = Object.keys(LLM_PROVIDERS);
    expect(ids).toEqual(expect.arrayContaining(['openai', 'anthropic', 'google', 'openrouter', 'custom']));
    for (const id of ['openai', 'anthropic', 'google']) {
      expect(LLM_PROVIDERS[id].models.length).toBeGreaterThan(0);
      expect(LLM_PROVIDERS[id].defaultModel).toBeTruthy();
    }
  });

  it('listLlmProviders reports each provider, its models and whether a key is configured', () => {
    const list = listLlmProviders({ configured: { openai: true } });
    const openai = list.find((p) => p.provider === 'openai');
    expect(openai).toMatchObject({ configured: true });
    expect(openai.models).toContain(openai.defaultModel);
    expect(list.find((p) => p.provider === 'anthropic').configured).toBe(false);
  });

  it('resolveLlmModel honours an explicit model, else the provider default (no hardcode outside the registry)', () => {
    expect(resolveLlmModel('anthropic', 'claude-opus-5')).toBe('claude-opus-5');
    expect(resolveLlmModel('anthropic')).toBe(LLM_PROVIDERS.anthropic.defaultModel);
    expect(() => resolveLlmModel('nope')).toThrow(/LLM_PROVIDER_UNSUPPORTED/);
  });
});

describe('createLlmClient — one contract, many vendors', () => {
  const messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }];

  it('openai: posts /chat/completions with bearer auth and normalizes the reply', async () => {
    const { fetchImpl, calls } = captureFetch({ choices: [{ message: { content: 'A' } }] });
    const client = createLlmClient({ provider: 'openai', apiKey: 'k1', model: 'gpt-x', fetchImpl });
    const out = await client.complete({ messages, temperature: 0 });
    expect(out.content).toBe('A');
    expect(out).toMatchObject({ provider: 'openai', model: 'gpt-x' });
    expect(calls[0].url).toContain('/chat/completions');
    expect(calls[0].init.headers.Authorization).toBe('Bearer k1');
    expect(calls[0].body).toMatchObject({ model: 'gpt-x', messages, temperature: 0 });
  });

  it('anthropic: posts /messages with x-api-key + version header, splits the system prompt, normalizes content[]', async () => {
    const { fetchImpl, calls } = captureFetch({ content: [{ type: 'text', text: 'B' }] });
    const client = createLlmClient({ provider: 'anthropic', apiKey: 'k2', model: 'claude-opus-5', fetchImpl });
    const out = await client.complete({ messages, temperature: 0.2 });
    expect(out.content).toBe('B');
    expect(calls[0].url).toContain('/messages');
    expect(calls[0].init.headers['x-api-key']).toBe('k2');
    expect(calls[0].init.headers['anthropic-version']).toBeTruthy();
    // system goes to its own field; only user/assistant turns stay in messages
    expect(calls[0].body.system).toBe('sys');
    expect(calls[0].body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(calls[0].body.max_tokens).toBeGreaterThan(0);
  });

  it('google: posts :generateContent with the key in the query and normalizes candidates[]', async () => {
    const { fetchImpl, calls } = captureFetch({ candidates: [{ content: { parts: [{ text: 'C' }] } }] });
    const client = createLlmClient({ provider: 'google', apiKey: 'k3', model: 'gemini-x', fetchImpl });
    const out = await client.complete({ messages });
    expect(out.content).toBe('C');
    expect(calls[0].url).toContain('gemini-x:generateContent');
    expect(calls[0].url).toContain('key=k3');
    expect(calls[0].body.systemInstruction.parts[0].text).toBe('sys');
    expect(calls[0].body.contents[0]).toMatchObject({ role: 'user' });
  });

  it('custom: any OpenAI-compatible endpoint via an explicit baseUrl (self-hosted / new vendors)', async () => {
    const { fetchImpl, calls } = captureFetch({ choices: [{ message: { content: 'D' } }] });
    const client = createLlmClient({ provider: 'custom', apiKey: 'k4', model: 'local-m', baseUrl: 'https://llm.internal/v1', fetchImpl });
    expect((await client.complete({ messages })).content).toBe('D');
    expect(calls[0].url).toBe('https://llm.internal/v1/chat/completions');
  });

  it('fails with coded errors: unsupported provider, missing key, missing baseUrl for custom', () => {
    expect(() => createLlmClient({ provider: 'martian', apiKey: 'k' })).toThrow(/LLM_PROVIDER_UNSUPPORTED/);
    expect(() => createLlmClient({ provider: 'openai' })).toThrow(/LLM_API_KEY_REQUIRED/);
    expect(() => createLlmClient({ provider: 'custom', apiKey: 'k' })).toThrow(/LLM_BASE_URL_REQUIRED/);
  });

  it('surfaces a vendor error as a coded LLM_REQUEST_FAILED (never a leaked stack)', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, headers: { get: () => 'application/json' }, text: async () => '{"error":"rate"}' });
    const client = createLlmClient({ provider: 'openai', apiKey: 'k', model: 'm', fetchImpl });
    await expect(client.complete({ messages })).rejects.toMatchObject({ code: 'LLM_REQUEST_FAILED' });
  });
});
