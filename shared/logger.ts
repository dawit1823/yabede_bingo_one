/**
 * Structured Logger for Yabede Bingo
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class ClientLogger {
  private formatMessage(level: LogLevel, message: string, context?: any) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      ...(context ? { context } : {}),
    };
  }

  debug(message: string, context?: any) {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  info(message: string, context?: any) {
    console.info(`[INFO] ${message}`, context || '');
  }

  warn(message: string, context?: any) {
    console.warn(`[WARN] ${message}`, context || '');
  }

  error(message: string, context?: any) {
    console.error(`[ERROR] ${message}`, context || '');
  }
}

export const logger = new ClientLogger();
