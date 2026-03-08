import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeTokenFile } from "../../src/auth/token-store";
import {
  buildHealthResponse,
  createHealthState,
  markHealthReady,
  markHealthShuttingDown,
  markRefreshSuccess,
  markSyncFailure,
} from "../../src/server/health";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "whoosh-health-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("health endpoint", () => {
  it("returns 503 until the server is ready", async () => {
    const dir = await makeTempDir();
    const tokenPath = path.join(dir, "token.toml");
    await writeTokenFile(tokenPath, {
      access_token: "abc",
      refresh_token: "refresh",
      expires_at: "2036-03-08T13:00:00.000Z",
    });

    const state = createHealthState({
      credentialsFile: tokenPath,
      refreshIntervalMinutes: 45,
      now: new Date("2026-03-08T12:00:00.000Z"),
    });
    const response = await buildHealthResponse(state, new Date("2026-03-08T12:05:00.000Z"));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body.status).toBe("starting");
    expect(body.ready).toBe(false);
  });

  it("returns 200 after startup when auth and refresh state are healthy", async () => {
    const dir = await makeTempDir();
    const tokenPath = path.join(dir, "token.toml");
    await writeTokenFile(tokenPath, {
      access_token: "abc",
      refresh_token: "refresh",
      expires_at: "2036-03-08T13:00:00.000Z",
    });

    const state = createHealthState({
      credentialsFile: tokenPath,
      refreshIntervalMinutes: 45,
      now: new Date("2026-03-08T12:00:00.000Z"),
    });
    markRefreshSuccess(state, new Date("2026-03-08T12:01:00.000Z"));
    markSyncFailure(state, "temporary network error", new Date("2026-03-08T12:02:00.000Z"));
    markHealthReady(state);

    const response = await buildHealthResponse(state, new Date("2026-03-08T12:05:00.000Z"));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.ready).toBe(true);
    expect(body.auth).toEqual({
      authenticated: true,
      token_valid: true,
      refresh_token_present: true,
      refresh_recent: true,
      error: undefined,
    });
    expect(body.last_refresh).toEqual({
      status: "ok",
      at: "2026-03-08T12:01:00.000Z",
    });
    expect(body.last_refresh_success_at).toBe("2026-03-08T12:01:00.000Z");
    expect(body.last_sync).toEqual({
      status: "error",
      at: "2026-03-08T12:02:00.000Z",
      error: "temporary network error",
    });
  });

  it("returns 503 when auth has not been completed", async () => {
    const dir = await makeTempDir();
    const tokenPath = path.join(dir, "missing-token.toml");
    const state = createHealthState({
      credentialsFile: tokenPath,
      refreshIntervalMinutes: 45,
      now: new Date("2026-03-08T12:00:00.000Z"),
    });
    markRefreshSuccess(state, new Date("2026-03-08T12:01:00.000Z"));
    markHealthReady(state);

    const response = await buildHealthResponse(state, new Date("2026-03-08T12:05:00.000Z"));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.auth).toEqual({
      authenticated: false,
      token_valid: false,
      refresh_token_present: false,
      refresh_recent: true,
      error: expect.stringContaining("Unable to read token file"),
    });
  });

  it("returns 503 when the token is expired", async () => {
    const dir = await makeTempDir();
    const tokenPath = path.join(dir, "token.toml");
    await writeTokenFile(tokenPath, {
      access_token: "abc",
      refresh_token: "refresh",
      expires_at: "2026-03-08T11:00:00.000Z",
    });

    const state = createHealthState({
      credentialsFile: tokenPath,
      refreshIntervalMinutes: 45,
      now: new Date("2026-03-08T12:00:00.000Z"),
    });
    markRefreshSuccess(state, new Date("2026-03-08T12:01:00.000Z"));
    markHealthReady(state);

    const response = await buildHealthResponse(state, new Date("2026-03-08T12:05:00.000Z"));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.auth).toEqual({
      authenticated: true,
      token_valid: false,
      refresh_token_present: true,
      refresh_recent: true,
      error: undefined,
    });
  });

  it("returns 503 when the last successful refresh is stale", async () => {
    const dir = await makeTempDir();
    const tokenPath = path.join(dir, "token.toml");
    await writeTokenFile(tokenPath, {
      access_token: "abc",
      refresh_token: "refresh",
      expires_at: "2036-03-08T16:00:00.000Z",
    });

    const state = createHealthState({
      credentialsFile: tokenPath,
      refreshIntervalMinutes: 30,
      now: new Date("2026-03-08T12:00:00.000Z"),
    });
    markRefreshSuccess(state, new Date("2026-03-08T12:01:00.000Z"));
    markHealthReady(state);

    const response = await buildHealthResponse(state, new Date("2026-03-08T13:05:00.000Z"));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.auth).toEqual({
      authenticated: true,
      token_valid: true,
      refresh_token_present: true,
      refresh_recent: false,
      error: undefined,
    });
  });

  it("returns 503 while shutting down", async () => {
    const dir = await makeTempDir();
    const tokenPath = path.join(dir, "token.toml");
    await writeTokenFile(tokenPath, {
      access_token: "abc",
      refresh_token: "refresh",
      expires_at: "2036-03-08T13:00:00.000Z",
    });

    const state = createHealthState({
      credentialsFile: tokenPath,
      refreshIntervalMinutes: 45,
      now: new Date("2026-03-08T12:00:00.000Z"),
    });
    markRefreshSuccess(state, new Date("2026-03-08T12:01:00.000Z"));
    markHealthReady(state);
    markHealthShuttingDown(state);

    const response = await buildHealthResponse(state, new Date("2026-03-08T12:05:00.000Z"));
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body.status).toBe("stopping");
    expect(body.ready).toBe(false);
    expect(body.shutting_down).toBe(true);
  });
});
