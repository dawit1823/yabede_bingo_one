export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const LOG_LEVELS: Record<LogLevel, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLevelStr = (process.env.LOG_LEVEL || 'INFO').toUpperCase() as LogLevel;
const currentLevel = LOG_LEVELS[currentLevelStr] ?? LOG_LEVELS.INFO;

export const logger = {
  error: (msg: string, ...args: any[]) => {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error(`[ERROR] ${msg}`, ...args);
    }
  },
  warn: (msg: string, ...args: any[]) => {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn(`[WARN] ${msg}`, ...args);
    }
  },
  info: (msg: string, ...args: any[]) => {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log(`[INFO] ${msg}`, ...args);
    }
  },
  debug: (msg: string, ...args: any[]) => {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log(`[DEBUG] ${msg}`, ...args);
    }
  },
};
