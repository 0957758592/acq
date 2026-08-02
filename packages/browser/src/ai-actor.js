import { domainError } from '@acq/engine-domain';

// Stagehand-style AI actor (observe → act) over ANY BrowserProvider backend
// (own pool or Browserbase) using our unified `llm.complete`. Instead of hard-
// coded selectors like `#login`, the LLM looks at a live page snapshot and
// proposes/decides actions, so a login flow survives DOM drift (TZ §6.3 "AI
// proposes, validation is by-fact").
//
// Verify-by-fact: `observe` makes the REAL snapshot read + REAL LLM call. When
// the LLM/browser is absent the factory fails safe with a coded seam; a non-JSON
// model reply is a coded AI_ACTOR_RESPONSE_INVALID — never a leaked INTERNAL.
// `act` executes only if the backend actually exposes an action primitive;
// otherwise it returns an honest, coded "planned but not executed" result rather
// than pretending to click.
const OBSERVE_SYSTEM =
  'You are a web-automation observer. Given a page snapshot and a goal, return ' +
  'STRICT JSON {"candidates":[{"action":"click|type|navigate|extract","target":"human description","selector":"best CSS/text selector","value":"text for type actions"}]} — no prose.';

const ACT_SYSTEM =
  'You are a web-automation actor. Given a page snapshot, a goal and candidate ' +
  'actions, return STRICT JSON for the SINGLE best next action ' +
  '{"action":"click|type|navigate|extract","selector":"...","value":"...","reason":"..."} — no prose.';

function parseJsonReply(content, code) {
  try {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    return JSON.parse(start >= 0 && end >= 0 ? content.slice(start, end + 1) : content);
  } catch {
    throw domainError(code, 'model did not return valid JSON');
  }
}

export function createAiActor({ llm, browser, snapshotFn = () => document.body.innerText } = {}) {
  if (!llm) throw domainError('AI_ACTOR_LLM_REQUIRED', 'ai actor requires an llm client (llm.complete)');
  if (!browser) throw domainError('AI_ACTOR_BROWSER_REQUIRED', 'ai actor requires a browser backend');

  async function snapshot(sessionId, { url = null } = {}) {
    // Read the live page through the SAME BrowserProvider port both backends share.
    // A backend without extract() (e.g. a raw CDP cloud session) can't snapshot —
    // say so with a coded seam rather than throwing a TypeError.
    if (typeof browser.extract !== 'function') {
      throw domainError('AI_ACTOR_SNAPSHOT_UNSUPPORTED', 'browser backend has no extract() to snapshot the page');
    }
    return browser.extract(sessionId, { url, pageFunction: snapshotFn });
  }

  async function observe(sessionId, { goal, url = null } = {}) {
    if (!goal) throw domainError('AI_ACTOR_GOAL_REQUIRED', 'observe requires a goal');
    const page = await snapshot(sessionId, { url });
    const { content } = await llm.complete({
      messages: [
        { role: 'system', content: OBSERVE_SYSTEM },
        { role: 'user', content: `GOAL: ${goal}\n\nPAGE SNAPSHOT:\n${String(page).slice(0, 6000)}` }
      ],
      temperature: 0,
      responseFormat: { type: 'json_object' }
    });
    const parsed = parseJsonReply(content, 'AI_ACTOR_RESPONSE_INVALID');
    return { goal, candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [] };
  }

  async function act(sessionId, { goal, url = null } = {}) {
    const { candidates } = await observe(sessionId, { goal, url });
    const { content } = await llm.complete({
      messages: [
        { role: 'system', content: ACT_SYSTEM },
        { role: 'user', content: `GOAL: ${goal}\n\nCANDIDATES:\n${JSON.stringify(candidates)}` }
      ],
      temperature: 0,
      responseFormat: { type: 'json_object' }
    });
    const action = parseJsonReply(content, 'AI_ACTOR_RESPONSE_INVALID');
    // Execute only if the backend exposes an action primitive — otherwise say so
    // honestly (coded), never fake a click.
    if (typeof browser.act === 'function') {
      const result = await browser.act(sessionId, action);
      return { action, executed: true, result };
    }
    return { action, executed: false, reason: 'BROWSER_ACT_UNSUPPORTED' };
  }

  return { observe, act };
}
