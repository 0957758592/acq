import { systemClock, bareClock } from './system-clock.js';

describe('clock', () => {
  it('systemClock.now returns a Date', () => { expect(systemClock.now()).toBeInstanceOf(Date); });
  it('bareClock adapts a Clock port to the domain bare-function form', () => {
    const fixed = new Date('2026-07-10T00:00:00.000Z');
    const clock = { now: () => fixed };
    expect(bareClock(clock)()).toBe(fixed);
  });
});
