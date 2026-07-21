import { chance, clamp, gaussianRandom, randomBetween } from './random.js';

const BACKSPACE_KEY_CODE = 67;
const SAFE_TEXT_CHUNK = /[A-Za-z0-9_.@#-]+/g;

function splitForShellInput(text = '') {
  const source = String(text || '');
  const chunks = [];
  let lastIndex = 0;
  for (const match of source.matchAll(SAFE_TEXT_CHUNK)) {
    if (match.index > lastIndex) chunks.push(source.slice(lastIndex, match.index));
    chunks.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) chunks.push(source.slice(lastIndex));
  return chunks.filter(Boolean);
}

function shellInputValue(chunk = '') {
  return String(chunk)
    .replace(/\s/g, '%s')
    .replace(/'/g, '')
    .replace(/"/g, '')
    .replace(/[;&|`$<>\\]/g, '');
}

function maybeTypo(chunk, random) {
  if (!/^[A-Za-z]{3,}$/.test(chunk)) return '';
  const index = Math.floor(randomBetween(random, 0, chunk.length));
  const characterCode = 97 + Math.floor(randomBetween(random, 0, 26));
  return `${chunk.slice(0, index)}${String.fromCharCode(characterCode)}`;
}

function keyDelay(profile = null) {
  const random = profile?.random || Math.random;
  const mean = Number(profile?.typing?.keyDelayMeanMs || 135);
  const speed = Number(profile?.personality?.typingSpeedMultiplier || 1);
  return Math.round(clamp(mean / speed + gaussianRandom(random) * 42, 35, 420));
}

export function buildTypingPlan(text = '', profile = null) {
  const random = profile?.random || Math.random;
  const typoRate = Number(profile?.personality?.typoRate || 0.012);
  const steps = [];

  for (const rawChunk of splitForShellInput(text)) {
    const chunk = shellInputValue(rawChunk);
    if (!chunk) continue;

    const typo = chance(random, typoRate) ? shellInputValue(maybeTypo(chunk, random)) : '';
    if (typo) {
      steps.push({ type: 'text', value: typo });
      steps.push({ type: 'sleep', ms: keyDelay(profile) });
      steps.push({ type: 'key', code: BACKSPACE_KEY_CODE });
      steps.push({ type: 'sleep', ms: keyDelay(profile) * 2 });
    }

    steps.push({ type: 'text', value: chunk });
    steps.push({ type: 'sleep', ms: keyDelay(profile) });

    if (chance(random, 0.08)) {
      steps.push({ type: 'sleep', ms: Math.round(randomBetween(random, 250, 950)) });
    }
  }

  return steps;
}
