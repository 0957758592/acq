import { IntegrationHttpClient } from './http-client.js';

export class LlmClient {
  constructor({ provider, apiKey, model, baseUrl } = {}) {
    if (!provider) throw new Error('LLM provider is required');
    if (!apiKey) throw new Error('LLM API key is required');
    this.provider = provider;
    this.model = model;
    this.http = new IntegrationHttpClient({
      baseUrl,
      headers: { Authorization: `Bearer ${apiKey}` }
    });
  }

  async complete({ messages, temperature = 0.7, responseFormat = null } = {}) {
    if (this.provider === 'openrouter' || this.provider === 'openai') {
      return this.http.request('/chat/completions', {
        method: 'POST',
        body: {
          model: this.model,
          messages,
          temperature,
          response_format: responseFormat
        }
      });
    }
    throw new Error(`Unsupported LLM provider: ${this.provider}`);
  }
}

export function createOpenRouterClient({ apiKey, model = 'openai/gpt-4o-mini' } = {}) {
  return new LlmClient({
    provider: 'openrouter',
    apiKey,
    model,
    baseUrl: 'https://openrouter.ai/api/v1'
  });
}
