import {
  boundsJitter,
  buildSwipePath,
  buildTypingPlan,
  chance,
  hesitationMs,
  humanDelayMs,
  jitterPoint,
  readingTimeMs
} from '@acq/humanizer';
import { delay, findElement, findElementExact, getAllText, parseUIDump } from '@acq/device-control';

function labelsArray(labels = []) {
  return Array.isArray(labels) ? labels : [labels];
}

function elementText(elements = []) {
  return getAllText(elements).join(' ');
}

export function createHumanActor({ controller, profile } = {}) {
  if (!controller) throw new Error('Human actor requires an automation controller');
  const behaviorProfile = profile || {};

  async function pause(options = {}) {
    const ms = humanDelayMs({ ...options, profile: behaviorProfile });
    await delay(ms);
    return ms;
  }

  async function elements() {
    return parseUIDump(await controller.getUIDump());
  }

  async function read(items = null) {
    const visible = items || (await elements());
    const ms = readingTimeMs(elementText(visible), behaviorProfile);
    await delay(ms);
    return ms;
  }

  async function tapElement(element, options = {}) {
    if (!element) return false;
    await delay(options.delayBeforeMs ?? hesitationMs(behaviorProfile));
    const radius =
      options.radius || behaviorProfile?.gestures?.tapRadiusMean || behaviorProfile?.personality?.tapRadius || 6;
    const target =
      boundsJitter(element.bounds, { radius, profile: behaviorProfile }) ||
      jitterPoint({ x: element.x, y: element.y, radius, profile: behaviorProfile });

    if (options.allowMiss !== false && chance(behaviorProfile.random || Math.random, 0.015)) {
      await controller.tap(target.x + Math.round(radius * 1.8), target.y);
      await pause({ meanMs: 240, standardDeviationMs: 90, minMs: 120, maxMs: 650 });
    }

    await controller.tap(target.x, target.y);
    await pause({ meanMs: options.afterMs || 850, standardDeviationMs: 220, minMs: 250, maxMs: 2_000 });
    return true;
  }

  async function findAndTap(labels, options = {}) {
    const candidates = labelsArray(labels);
    for (let attempt = 0; attempt < Number(options.rounds || 3); attempt += 1) {
      const visible = await elements();
      if (options.readBefore !== false) await read(visible);
      const found = options.exact ? findElementExact(visible, ...candidates) : findElement(visible, ...candidates);
      if (found) return tapElement(found, options);
      await pause({ meanMs: 650, standardDeviationMs: 180, minMs: 250, maxMs: 1_500 });
    }
    return false;
  }

  async function waitFor(labels, options = {}) {
    const candidates = labelsArray(labels);
    const startedAt = Date.now();
    const timeoutMs = Number(options.timeoutMs || 12_000);
    const intervalMs = Number(options.intervalMs || 800);

    while (Date.now() - startedAt < timeoutMs) {
      const visible = await elements();
      const found = options.exact ? findElementExact(visible, ...candidates) : findElement(visible, ...candidates);
      if (found) return found;
      await pause({
        meanMs: intervalMs,
        standardDeviationMs: Math.max(120, intervalMs * 0.25),
        minMs: Math.max(200, intervalMs * 0.5),
        maxMs: Math.max(intervalMs, intervalMs * 1.8)
      });
    }

    return null;
  }

  async function type(text, options = {}) {
    const steps = buildTypingPlan(text, behaviorProfile);
    if (controller.typeSequence) {
      return controller.typeSequence(steps, {
        timeoutMs: options.timeoutMs || Math.max(20_000, steps.length * 800)
      });
    }
    return controller.inputText(text);
  }

  async function swipe(from, to, options = {}) {
    const points = buildSwipePath(from, to, behaviorProfile);
    if (controller.gestureSwipe) return controller.gestureSwipe(points, options);
    const start = points[0];
    const end = points[points.length - 1];
    return controller.swipe(start.x, start.y, end.x, end.y, options.durationMs || 450);
  }

  async function swipeUp(options = {}) {
    const x = options.x || 360;
    return swipe(
      { x, y: options.startY || 1_060 },
      { x: options.endX || x, y: options.endY || 280 },
      options
    );
  }

  async function swipeDown(options = {}) {
    const x = options.x || 360;
    return swipe(
      { x, y: options.startY || 360 },
      { x: options.endX || x, y: options.endY || 1_080 },
      options
    );
  }

  async function scrollFeed(count = 1, options = {}) {
    for (let index = 0; index < count; index += 1) {
      await pause({ meanMs: options.beforeMs || 1_800, standardDeviationMs: 700, minMs: 650, maxMs: 4_500 });
      await swipeUp(options);
    }
    return { success: true, swipes: count };
  }

  return {
    controller,
    profile: behaviorProfile,
    pause,
    elements,
    read,
    tapElement,
    findAndTap,
    waitFor,
    type,
    swipe,
    swipeUp,
    swipeDown,
    scrollFeed
  };
}
