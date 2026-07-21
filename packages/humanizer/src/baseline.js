import { createSeededPersonality } from './personality.js';
import { createSeededRandom } from './random.js';

const DEFAULT_PROFILE = {
  gestures: {
    tapRadiusMean: 6,
    swipeDurationMeanMs: 430,
    swipeDistanceMeanPx: 760
  },
  typing: {
    keyDelayMeanMs: 135,
    burstSizeMean: 5
  },
  timing: {
    actionDelayMeanMs: 850,
    readingWordsPerMinute: 220
  }
};

function mergeSection(base = {}, next = {}) {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(next || {}).filter(([, value]) => value !== undefined && value !== null))
  };
}

function normalizeBaseline(baseline = {}) {
  return {
    scope: baseline.scope || 'global',
    gestures: baseline.gestures || {},
    typing: baseline.typing || {},
    timing: baseline.timing || {}
  };
}

export function resolveBehaviorProfile({ baselines = [], seed = '' } = {}) {
  const personality = createSeededPersonality(seed);
  const ordered = [...baselines].map(normalizeBaseline).sort((left, right) => {
    const rank = { global: 0, device: 1, account: 2 };
    return (rank[left.scope] ?? 0) - (rank[right.scope] ?? 0);
  });

  const merged = ordered.reduce(
    (profile, baseline) => ({
      ...profile,
      gestures: mergeSection(profile.gestures, baseline.gestures),
      typing: mergeSection(profile.typing, baseline.typing),
      timing: mergeSection(profile.timing, baseline.timing)
    }),
    DEFAULT_PROFILE
  );

  return {
    ...merged,
    seed: String(seed || personality.seed),
    personality,
    random: createSeededRandom(seed || personality.seed)
  };
}
