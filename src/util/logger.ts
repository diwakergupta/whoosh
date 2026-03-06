import pino, { type Logger as PinoLogger } from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

const REDACT_PATHS = [
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "apiKey",
  "headers.authorization",
  "headers.cookie",
  "headers['set-cookie']",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "request.headers.authorization",
  "request.headers.cookie",
  "request.headers['set-cookie']",
] as const;

function resolveLevel(level?: string): LogLevel {
  const resolved = (level ?? process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (resolved === "debug" || resolved === "info" || resolved === "warn" || resolved === "error") {
    return resolved;
  }
  return "info";
}

export class Logger {
  constructor(private readonly inner: PinoLogger) {}

  child(bindings: Record<string, unknown>): Logger {
    return new Logger(this.inner.child(bindings));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.inner.debug(context ?? {}, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.inner.info(context ?? {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.inner.warn(context ?? {}, message);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.inner.error(context ?? {}, message);
  }
}

export function createLogger(level?: string): Logger {
  const inner = pino(
    {
      name: "whoosh",
      level: resolveLevel(level),
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [...REDACT_PATHS],
        censor: "[REDACTED]",
      },
    },
    pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "SYS:standard",
      },
    }),
  );

  return new Logger(inner);
}
