export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function toLogLevel(level: string): LogLevel {
  const normalized = level.toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return "info";
}

export class Logger {
  private readonly level: LogLevel;

  constructor(level: string = "info") {
    this.level = toLogLevel(level);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) {
      return;
    }

    const stamp = new Date().toISOString();
    if (!context || Object.keys(context).length === 0) {
      // eslint-disable-next-line no-console
      console.log(`${stamp} ${level.toUpperCase()} ${message}`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`${stamp} ${level.toUpperCase()} ${message}`, context);
  }
}

export function createLogger(level: string): Logger {
  return new Logger(level);
}
