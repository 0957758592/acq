export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function hashSeed(seed = '') {
  return [...String(seed || 'default')].reduce((accumulator, character) => {
    return (accumulator * 31 + character.charCodeAt(0)) >>> 0;
  }, 7);
}

export function createSeededRandom(seed = '') {
  let value = hashSeed(seed) || 1;
  return function seededRandom() {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussianRandom(random = Math.random) {
  let first = 0;
  let second = 0;
  while (first === 0) first = random();
  while (second === 0) second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

export function randomBetween(random, min, max) {
  return min + random() * (max - min);
}

export function chance(random, rate = 0) {
  return random() < clamp(Number(rate || 0), 0, 1);
}
