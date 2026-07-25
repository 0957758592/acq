// Pluggable LLM backends (TZ §6.3 "AI proposes, validation is by-fact" + the
// REQUIREM rule that nothing is hardcoded). ONE `complete()` contract over many
// vendors: OpenAI (default), Anthropic, Google Gemini, OpenRouter, and any
// OpenAI-compatible endpoint via `custom`. Every provider declares its base URL,
// auth shape, request builder and response normalizer, so adding a vendor is a
// registry entry — no branching anywhere else in the platform (Open/Closed).
//
// Model lists are DEFAULT CATALOGS for the picker: an operator may pass any
// model id the vendor supports (or extend the catalog through config) — the
// registry never restricts what can be selected.
function llmError(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

// Split an OpenAI-style message list into a system prompt + conversational turns
// (Anthropic and Gemini both carry the system prompt out-of-band).
function splitSystem(messages = []) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages.filter((m) => m.role !== 'system');
  return { system, turns };
}

const openAiCompatible = {
  path: () => '/chat/completions',
  headers: ({ apiKey }) => ({ Authorization: `Bearer ${apiKey}` }),
  body: ({ model, messages, temperature, responseFormat }) => ({
    model,
    messages,
    temperature,
    ...(responseFormat ? { response_format: responseFormat } : {})
  }),
  parse: (json) => json?.choices?.[0]?.message?.content ?? ''
};

export const LLM_PROVIDERS = {
  openai: {
    label: 'OpenAI (GPT / Codex)',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5-codex',
    models: ['gpt-5-codex', 'gpt-5', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o3'],
    ...openAiCompatible
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-opus-5',
    models: ['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    path: () => '/messages',
    headers: ({ apiKey }) => ({ 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }),
    body: ({ model, messages, temperature, maxTokens }) => {
      const { system, turns } = splitSystem(messages);
      return {
        model,
        max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature,
        ...(system ? { system } : {}),
        messages: turns.map((m) => ({ role: m.role, content: m.content }))
      };
    },
    parse: (json) => (json?.content ?? []).filter((p) => p?.type === 'text').map((p) => p.text).join('') || ''
  },
  google: {
    label: 'Google (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-pro',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    // Gemini keys travel in the query string and the model is part of the path.
    path: ({ model, apiKey }) => `/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    headers: () => ({}),
    body: ({ messages, temperature }) => {
      const { system, turns } = splitSystem(messages);
      return {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: turns.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        ...(temperature != null ? { generationConfig: { temperature } } : {})
      };
    },
    parse: (json) => (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text).join('') || ''
  },
  openrouter: {
    label: 'OpenRouter (multi-vendor gateway)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'google/gemini-2.0-flash-001'],
    ...openAiCompatible
  },
  custom: {
    label: 'Custom OpenAI-compatible endpoint',
    baseUrl: null, // must be supplied (self-hosted vLLM/Ollama/gateway/new vendor)
    defaultModel: null,
    models: [],
    ...openAiCompatible
  }
};

export function listLlmProviders({ configured = {} } = {}) {
  return Object.entries(LLM_PROVIDERS).map(([provider, spec]) => ({
    provider,
    label: spec.label,
    baseUrl: spec.baseUrl,
    defaultModel: spec.defaultModel,
    models: spec.models,
    configured: Boolean(configured[provider])
  }));
}

export function resolveLlmModel(provider, model = null) {
  const spec = LLM_PROVIDERS[provider];
  if (!spec) throw llmError('LLM_PROVIDER_UNSUPPORTED', `unknown LLM provider '${provider}'`);
  const resolved = model || spec.defaultModel;
  if (!resolved) throw llmError('LLM_MODEL_REQUIRED', `provider '${provider}' has no default model — pass one`);
  return resolved;
}

// Unified client: complete({messages,temperature,responseFormat,maxTokens})
// -> { content, provider, model, raw }. Callers never branch on the vendor.
export function createLlmClient({ provider = 'openai', apiKey, model = null, baseUrl = null, fetchImpl = globalThis.fetch, timeoutMs = 60_000 } = {}) {
  const spec = LLM_PROVIDERS[provider];
  if (!spec) throw llmError('LLM_PROVIDER_UNSUPPORTED', `unknown LLM provider '${provider}'`);
  if (!apiKey) throw llmError('LLM_API_KEY_REQUIRED', `provider '${provider}' requires an API key`);
  const root = (baseUrl || spec.baseUrl || '').replace(/\/+$/, '');
  if (!root) throw llmError('LLM_BASE_URL_REQUIRED', `provider '${provider}' requires an explicit baseUrl`);
  const resolvedModel = resolveLlmModel(provider, model);

  return {
    provider,
    model: resolvedModel,
    async complete({ messages = [], temperature = 0.7, responseFormat = null, maxTokens = null } = {}) {
      const url = `${root}${spec.path({ model: resolvedModel, apiKey })}`;
      const body = spec.body({ model: resolvedModel, messages, temperature, responseFormat, maxTokens });
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...spec.headers({ apiKey }) },
          body: JSON.stringify(body),
          signal: controller?.signal
        });
      } catch (err) {
        throw llmError('LLM_REQUEST_FAILED', `${provider} request failed: ${err.message}`);
      } finally {
        if (timer) clearTimeout(timer);
      }
      const text = await response.text();
      if (!response.ok) {
        throw llmError('LLM_REQUEST_FAILED', `${provider} responded ${response.status}: ${String(text).slice(0, 200)}`);
      }
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw llmError('LLM_RESPONSE_INVALID', `${provider} returned non-JSON`);
      }
      return { content: spec.parse(json), provider, model: resolvedModel, raw: json };
    }
  };
}
