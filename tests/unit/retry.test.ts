import { describe, expect, it } from "bun:test";
import { AppError } from "../../src/util/errors";
import { retryAsync } from "../../src/whoop/retry";

describe("retryAsync", () => {
  it("retries retryable errors then succeeds", async () => {
    let attempts = 0;

    const value = await retryAsync(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new AppError("temporary", "RETRYABLE", { retryable: true });
        }
        return "ok";
      },
      {
        wait: async () => {},
        shouldRetry: (error) => error instanceof AppError && error.code === "RETRYABLE",
      },
    );

    expect(value).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let attempts = 0;

    await expect(
      retryAsync(
        async () => {
          attempts += 1;
          throw new AppError("bad", "AUTH");
        },
        {
          wait: async () => {},
          shouldRetry: (error) => error instanceof AppError && error.code === "RETRYABLE",
        },
      ),
    ).rejects.toThrow("bad");

    expect(attempts).toBe(1);
  });
});
