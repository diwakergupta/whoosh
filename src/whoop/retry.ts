import { AppError, isAppError } from "../util/errors";
import { sleep } from "../util/time";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  maxElapsedMs?: number;
  initialDelayMs?: number;
  multiplier?: number;
  jitter?: number;
  wait?: (ms: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

export interface FetchRetryOptions extends RetryOptions {
  fetchImpl?: FetchLike;
}

export async function retryAsync<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxElapsedMs = options.maxElapsedMs ?? 5 * 60 * 1000;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const multiplier = options.multiplier ?? 1.5;
  const jitter = options.jitter ?? 0.5;
  const wait = options.wait ?? sleep;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let delayMs = initialDelayMs;
  const startedAt = Date.now();
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      if (!shouldRetry(error)) {
        throw error;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed >= maxElapsedMs) {
        throw error;
      }

      const jitterSpread = delayMs * jitter;
      const randomOffset = (Math.random() * jitterSpread * 2) - jitterSpread;
      const nextDelay = Math.max(50, Math.round(delayMs + randomOffset));

      options.onRetry?.(attempt, nextDelay, error);
      await wait(nextDelay);
      delayMs = delayMs * multiplier;
    }
  }
}

function statusToError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError(`Whoop API returned auth failure ${status}.`, "AUTH", { status });
  }

  if (status === 429 || status >= 500) {
    return new AppError(`Whoop API returned retryable status ${status}.`, "RETRYABLE", {
      retryable: true,
      status,
    });
  }

  if (status === 404) {
    return new AppError("Whoop API endpoint not found.", "FATAL", { status });
  }

  return new AppError(`Whoop API request failed with status ${status}.`, "FATAL", { status });
}

function shouldRetryError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.code === "RETRYABLE" || error.retryable;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("fetch") || msg.includes("network") || msg.includes("timeout") || msg.includes("socket");
  }

  return false;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const { fetchImpl, ...retryOptions } = options;
  const fetchFn: FetchLike = fetchImpl ?? fetch;

  return retryAsync(async () => {
    let response: Response;

    try {
      response = await fetchFn(input, init);
    } catch (error) {
      throw new AppError("Network request failed.", "RETRYABLE", {
        retryable: true,
        cause: error,
      });
    }

    if (!response.ok) {
      throw statusToError(response.status);
    }

    return response;
  }, {
    ...retryOptions,
    shouldRetry: retryOptions.shouldRetry ?? shouldRetryError,
  });
}
