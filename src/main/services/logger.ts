type Level = 'debug' | 'info' | 'warn' | 'error';

function fmt(level: Level, args: unknown[]): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${args
    .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
    .join(' ')}`;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = {
  debug: (...args: unknown[]) => console.debug(fmt('debug', args)),
  info: (...args: unknown[]) => console.info(fmt('info', args)),
  warn: (...args: unknown[]) => console.warn(fmt('warn', args)),
  error: (...args: unknown[]) => console.error(fmt('error', args))
};
