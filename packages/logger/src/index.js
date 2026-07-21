const LEVELS = ['debug', 'info', 'warn', 'error'];

function normalizeLevel(level) {
  return LEVELS.includes(level) ? level : 'info';
}

function shouldLog(currentLevel, level) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel);
}

export function createLogger({ level = 'info', transport = console } = {}) {
  const currentLevel = normalizeLevel(level);

  function logAt(logLevel, message, meta) {
    if (!shouldLog(currentLevel, logLevel)) return;
    const fn = transport[logLevel] || transport.log || console.log;
    if (meta !== undefined) {
      fn(`[${logLevel}] ${message}`, meta);
    } else {
      fn(`[${logLevel}] ${message}`);
    }
  }

  return {
    level: currentLevel,
    debug(message, meta) {
      logAt('debug', message, meta);
    },
    info(message, meta) {
      logAt('info', message, meta);
    },
    warn(message, meta) {
      logAt('warn', message, meta);
    },
    error(message, meta) {
      logAt('error', message, meta);
    }
  };
}

export const defaultLogger = createLogger();

export { createStructuredLogger } from './structured.js';

