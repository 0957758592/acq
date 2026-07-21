import { clamp, gaussianRandom } from './random.js';

export function humanDelayMs(
  { meanMs = 750, standardDeviationMs = 200, minMs = 100, maxMs = 3_000, profile = null } = {}
) {
  const random = profile?.random || Math.random;
  const multiplier = Number(profile?.personality?.delayMultiplier || 1);
  return Math.round(
    clamp(meanMs * multiplier + gaussianRandom(random) * standardDeviationMs, minMs, maxMs)
  );
}

export function readingTimeMs(text = '', profile = null) {
  const words = String(text || '').split(/\s+/).filter(Boolean).length;
  if (!words) return humanDelayMs({ meanMs: 350, standardDeviationMs: 100, minMs: 180, maxMs: 900, profile });
  const wordsPerMinute = Number(profile?.timing?.readingWordsPerMinute || 220);
  const baseMs = (words / wordsPerMinute) * 60_000;
  return humanDelayMs({
    meanMs: Math.min(Math.max(baseMs, 450), 2_800),
    standardDeviationMs: 180,
    minMs: 300,
    maxMs: 3_500,
    profile
  });
}

export function hesitationMs(profile = null) {
  return humanDelayMs({
    meanMs: Number(profile?.timing?.actionDelayMeanMs || 850),
    standardDeviationMs: 260,
    minMs: 180,
    maxMs: 2_500,
    profile
  });
}
