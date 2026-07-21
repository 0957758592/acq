export const systemClock = { now: () => new Date() };
export const bareClock = (clock) => () => clock.now();
