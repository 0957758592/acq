const LEVELS = ['debug', 'info', 'warn', 'error'];

function normalizeLevel(level) {
  return LEVELS.includes(level) ? level : 'info';
}

function shouldLog(currentLevel, level) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel);
}

export function createStructuredLogger({
  level = 'info',
  stream = process.stdout,
  clock = () => new Date(),
  base = {}
} = {}) {
  const currentLevel = normalizeLevel(level);

  function emit(logLevel, message, meta) {
    if (!shouldLog(currentLevel, logLevel)) return;
    const line = {
      level: logLevel,
      time: clock().toISOString(),
      msg: message,
      ...base,
      ...(meta || {})
    };
    stream.write(`${JSON.stringify(line)}\n`);
  }

  return {
    level: currentLevel,
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child(bindings) {
      return createStructuredLogger({
        level: currentLevel,
        stream,
        clock,
        base: { ...base, ...bindings }
      });
    }
  };
}
