import { createStructuredLogger } from './structured.js';

function fakeSink() {
  const lines = [];
  return {
    lines,
    write: (str) => { lines.push(str); }
  };
}

const clock = () => new Date('2026-07-09T00:00:00.000Z');

describe('createStructuredLogger', () => {
  it('emits one JSON line per log with level, time and message', () => {
    const stream = fakeSink();
    const log = createStructuredLogger({ level: 'info', stream, clock });
    log.info('hello', { deviceId: 'd1' });
    expect(stream.lines).toHaveLength(1);
    const parsed = JSON.parse(stream.lines[0]);
    expect(parsed).toEqual({
      level: 'info', time: '2026-07-09T00:00:00.000Z', msg: 'hello', deviceId: 'd1'
    });
    expect(stream.lines[0].endsWith('\n')).toBe(true);
  });

  it('filters below the configured level', () => {
    const stream = fakeSink();
    const log = createStructuredLogger({ level: 'warn', stream, clock });
    log.info('ignored');
    log.error('kept');
    expect(stream.lines).toHaveLength(1);
    expect(JSON.parse(stream.lines[0]).msg).toBe('kept');
  });

  it('child() binds correlation fields onto every line', () => {
    const stream = fakeSink();
    const log = createStructuredLogger({ level: 'info', stream, clock })
      .child({ correlationId: 'corr-1' });
    log.info('work');
    expect(JSON.parse(stream.lines[0]).correlationId).toBe('corr-1');
  });
});
