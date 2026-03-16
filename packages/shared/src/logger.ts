export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function emit(level: string, message: string, context?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    ts: new Date().toISOString(),
    ...context
  };
  console.log(JSON.stringify(payload));
}

export function createLogger(): Logger {
  return {
    debug(message, context) {
      emit('debug', message, context);
    },
    info(message, context) {
      emit('info', message, context);
    },
    warn(message, context) {
      emit('warn', message, context);
    },
    error(message, context) {
      emit('error', message, context);
    }
  };
}
