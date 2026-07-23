import { createLlmShopScanner } from './shop-scanner.js';

const validSpecJson = JSON.stringify({
  shopId: 'scanned-shop', baseUrl: 'https://shop.example', platform: 'telegram',
  auth: { kind: 'api-key', config: {} },
  endpoints: {
    balance: { method: 'GET', path: '/balance', responseMap: {} },
    offers: { method: 'GET', path: '/offers', responseMap: {} },
    purchase: { method: 'POST', path: '/buy', responseMap: {} },
    delivery: { method: 'POST', path: '/delivery', responseMap: {} }
  }
});

describe('createLlmShopScanner (AI proposes a ShopAdapterSpec)', () => {
  it('fetches page text, prompts the LLM, and returns an UNVERIFIED draft spec', async () => {
    const seen = {};
    const llmClient = { complete: async (req) => { seen.req = req; return validSpecJson; } };
    const fetchShopText = async ({ shopUrl }) => { seen.url = shopUrl; return 'API docs: /balance /offers /buy /delivery'; };
    const scanner = createLlmShopScanner({ llmClient, fetchShopText });
    const draft = await scanner.propose({ shopUrl: 'https://shop.example' });
    expect(draft).toMatchObject({ shopId: 'scanned-shop', verified: false });
    expect(seen.url).toBe('https://shop.example');
    expect(seen.req.messages[0].role).toBe('system');
  });

  it('handles a chat-completion-shaped response ({choices[].message.content})', async () => {
    const llmClient = { complete: async () => ({ choices: [{ message: { content: 'here you go: ' + validSpecJson } }] }) };
    const scanner = createLlmShopScanner({ llmClient, fetchShopText: async () => 'text' });
    const draft = await scanner.propose({ shopUrl: 'https://shop.example' });
    expect(draft.shopId).toBe('scanned-shop');
  });

  it('fails safe when the LLM returns no JSON', async () => {
    const scanner = createLlmShopScanner({ llmClient: { complete: async () => 'sorry, cannot help' }, fetchShopText: async () => 't' });
    await expect(scanner.propose({ shopUrl: 'https://x' })).rejects.toMatchObject({ code: 'SHOP_SCAN_PARSE_FAILED' });
  });

  it('requires a shopUrl', async () => {
    const scanner = createLlmShopScanner({ llmClient: { complete: async () => validSpecJson }, fetchShopText: async () => 't' });
    await expect(scanner.propose({})).rejects.toMatchObject({ code: 'SHOP_URL_REQUIRED' });
  });
});
