import { domainError } from '@acq/engine-domain';

// Extracts the first embedded JSON state blob from a public HTML page (anon-http
// tier, TZ §10.1). Handles both <script type="application/json"> rehydration
// blobs and `window.X = {...}` assignments, via balanced-brace scanning so
// trailing script code never breaks the parse.
const ASSIGNMENT_MARKERS = ['SIGI_STATE', '__UNIVERSAL_DATA__', '_sharedData', '__NEXT_DATA__'];
const SCRIPT_TAG =
  /<script[^>]*(?:__UNIVERSAL_DATA_FOR_REHYDRATION__|__NEXT_DATA__)[^>]*>([\s\S]*?)<\/script>/i;

function balancedJsonFrom(str, braceIdx) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = braceIdx; i < str.length; i += 1) {
    const ch = str[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return str.slice(braceIdx, i + 1);
    }
  }
  return null;
}

function tryParse(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function extractEmbeddedJson(html) {
  const scriptMatch = SCRIPT_TAG.exec(html);
  if (scriptMatch) {
    const parsed = tryParse(scriptMatch[1].trim());
    if (parsed) return parsed;
  }

  for (const marker of ASSIGNMENT_MARKERS) {
    const markerIdx = html.indexOf(marker);
    if (markerIdx === -1) continue;
    const braceIdx = html.indexOf('{', markerIdx);
    if (braceIdx === -1) continue;
    const parsed = tryParse(balancedJsonFrom(html, braceIdx));
    if (parsed) return parsed;
  }

  throw domainError('SCRAPE_TARGET_UNAVAILABLE', 'no embedded JSON state found in page');
}
