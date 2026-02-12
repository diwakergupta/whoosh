export type ErrorCode = "AUTH" | "RETRYABLE" | "VALIDATION" | "CONFIG" | "FATAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, code: ErrorCode, options?: { retryable?: boolean; status?: number; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.retryable = Boolean(options?.retryable);
    this.status = options?.status;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isAuthError(error: unknown): boolean {
  return isAppError(error) && error.code === "AUTH";
}

export function getErrorCauseMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  let guard = 0;

  while (current && guard < 8) {
    guard += 1;
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
      continue;
    }
    break;
  }

  return messages;
}
