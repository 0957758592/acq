import { domainError } from '@acq/engine-domain';

// LLM shop scanner (TZ §6.3 SCAN) — the AI half of "AI proposes, deterministic
// code validates". It reads a shop's page text and asks an LLM to PROPOSE a
// declarative ShopAdapterSpec (JSON). It never executes a purchase and never
// marks a spec verified — that is the deterministic VALIDATE/APPROVE stage. The
// LLM client + page-text fetcher are injected; both are real I/O held outside
// the domain. Absent creds surface as a coded seam upstream, never a guess.
const SYSTEM_PROMPT =
  'You reverse-engineer account-shop APIs into a declarative ShopAdapterSpec JSON. ' +
  'Return ONLY JSON with: shopId, baseUrl, title, platform, auth{kind,config}, ' +
  'endpoints{balance,offers,purchase,delivery} each {method,path,responseMap} ' +
  '(delivery also deliveryFormat{format,itemMap}). Never invent credentials.';

function parseJson(out) {
  const text =
    typeof out === 'string'
      ? out
      : out?.content ?? out?.choices?.[0]?.message?.content ?? '';
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw domainError('SHOP_SCAN_PARSE_FAILED', 'LLM did not return a JSON spec');
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    throw domainError('SHOP_SCAN_PARSE_FAILED', `LLM returned invalid JSON: ${err.message}`);
  }
}

export function createLlmShopScanner({ llmClient, fetchShopText } = {}) {
  if (!llmClient || typeof llmClient.complete !== 'function') {
    throw new Error('createLlmShopScanner requires an llmClient');
  }
  if (typeof fetchShopText !== 'function') {
    throw new Error('createLlmShopScanner requires a fetchShopText function');
  }
  return {
    async propose({ shopUrl }) {
      if (!shopUrl) throw domainError('SHOP_URL_REQUIRED', 'shopUrl is required to scan a shop');
      const pageText = await fetchShopText({ shopUrl });
      const out = await llmClient.complete({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Shop URL: ${shopUrl}\n\nPage/API text:\n${String(pageText).slice(0, 12000)}` }
        ],
        temperature: 0,
        responseFormat: { type: 'json_object' }
      });
      const draft = parseJson(out);
      // The scanner only proposes — the spec is always UNVERIFIED until approved.
      return { ...draft, verified: false };
    }
  };
}
