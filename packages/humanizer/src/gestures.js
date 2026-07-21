import { chance, clamp, gaussianRandom, randomBetween } from './random.js';

export function jitterPoint({ x, y, radius = 6, profile = null } = {}) {
  const random = profile?.random || Math.random;
  return {
    x: Math.round(Number(x || 0) + gaussianRandom(random) * radius),
    y: Math.round(Number(y || 0) + gaussianRandom(random) * radius)
  };
}

export function parseBounds(bounds = '') {
  const match = String(bounds || '').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function boundsJitter(bounds = '', { radius = 6, profile = null } = {}) {
  const parsed = parseBounds(bounds);
  if (!parsed) return null;
  const insetX = Math.max(2, Math.min(parsed.width * 0.28, radius * 2));
  const insetY = Math.max(2, Math.min(parsed.height * 0.28, radius * 2));
  const random = profile?.random || Math.random;
  return {
    x: Math.round(randomBetween(random, parsed.left + insetX, parsed.right - insetX)),
    y: Math.round(randomBetween(random, parsed.top + insetY, parsed.bottom - insetY))
  };
}

function bezierPoint(start, controlOne, controlTwo, end, progress) {
  const inverse = 1 - progress;
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * progress * controlOne.x +
      3 * inverse * progress ** 2 * controlTwo.x +
      progress ** 3 * end.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * progress * controlOne.y +
      3 * inverse * progress ** 2 * controlTwo.y +
      progress ** 3 * end.y
  };
}

export function buildSwipePath(from = {}, to = {}, profile = null) {
  const random = profile?.random || Math.random;
  const duration = Number(profile?.gestures?.swipeDurationMeanMs || 430);
  const curviness = Number(profile?.personality?.swipeCurviness || 0.2);
  const distanceX = Number(to.x || 0) - Number(from.x || 0);
  const distanceY = Number(to.y || 0) - Number(from.y || 0);
  const distance = Math.hypot(distanceX, distanceY) || 1;
  const normal = { x: -distanceY / distance, y: distanceX / distance };
  const curve = distance * curviness * randomBetween(random, -1, 1);
  const steps = Math.round(clamp(distance / 95, 5, 12));
  const start = jitterPoint({ ...from, radius: Number(profile?.personality?.tapRadius || 6), profile });
  const end = jitterPoint({ ...to, radius: Number(profile?.personality?.tapRadius || 6), profile });
  const controlOne = {
    x: start.x + distanceX * 0.33 + normal.x * curve,
    y: start.y + distanceY * 0.33 + normal.y * curve
  };
  const controlTwo = {
    x: start.x + distanceX * 0.72 - normal.x * curve * 0.45,
    y: start.y + distanceY * 0.72 - normal.y * curve * 0.45
  };

  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const eased = 1 - (1 - progress) ** 2;
    const point = bezierPoint(start, controlOne, controlTwo, end, eased);
    points.push({
      x: Math.round(point.x),
      y: Math.round(point.y),
      durationMs: Math.round(clamp(duration / steps + gaussianRandom(random) * 16, 24, 120))
    });
  }

  if (chance(random, Number(profile?.personality?.overshootRate || 0.06))) {
    points.push({
      x: Math.round(end.x - distanceX * 0.025),
      y: Math.round(end.y - distanceY * 0.025),
      durationMs: Math.round(randomBetween(random, 45, 110))
    });
  }

  return points;
}
