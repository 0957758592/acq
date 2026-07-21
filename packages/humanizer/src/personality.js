import { createSeededRandom, randomBetween } from './random.js';

export function createSeededPersonality(seed = '') {
  const random = createSeededRandom(seed);
  return {
    seed: String(seed || 'default'),
    tapRadius: Math.round(randomBetween(random, 4, 10)),
    delayMultiplier: Number(randomBetween(random, 0.85, 1.18).toFixed(3)),
    hesitationRate: Number(randomBetween(random, 0.03, 0.14).toFixed(3)),
    typoRate: Number(randomBetween(random, 0.008, 0.025).toFixed(3)),
    typingSpeedMultiplier: Number(randomBetween(random, 0.85, 1.25).toFixed(3)),
    swipeCurviness: Number(randomBetween(random, 0.12, 0.32).toFixed(3)),
    overshootRate: Number(randomBetween(random, 0.03, 0.1).toFixed(3))
  };
}
