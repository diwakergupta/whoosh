import { isTokenExpired, normalizeToken, readTokenFile } from "../auth/token-store";
import { jsonResponse } from "../util/http";
import type { Logger } from "../util/logger";

type JobStatus = "unknown" | "ok" | "error";

interface JobHealth {
  status: JobStatus;
  at?: string;
  error?: string;
}

export interface HealthState {
  startedAt: string;
  credentialsFile: string;
  ready: boolean;
  shuttingDown: boolean;
  refreshIntervalMinutes: number;
  lastRefresh: JobHealth;
  lastRefreshSuccessAt?: string;
  lastSync: JobHealth;
}

export function createHealthState(options: {
  credentialsFile: string;
  refreshIntervalMinutes: number;
  now?: Date;
}): HealthState {
  const now = options.now ?? new Date();
  return {
    startedAt: now.toISOString(),
    credentialsFile: options.credentialsFile,
    ready: false,
    shuttingDown: false,
    refreshIntervalMinutes: options.refreshIntervalMinutes,
    lastRefresh: { status: "unknown" },
    lastSync: { status: "unknown" },
  };
}

export function markHealthReady(state: HealthState): void {
  state.ready = true;
}

export function markHealthShuttingDown(state: HealthState): void {
  state.shuttingDown = true;
  state.ready = false;
}

export function markRefreshSuccess(state: HealthState, now: Date = new Date()): void {
  const at = now.toISOString();
  state.lastRefresh = {
    status: "ok",
    at,
  };
  state.lastRefreshSuccessAt = at;
}

export function markRefreshFailure(state: HealthState, error: string, now: Date = new Date()): void {
  state.lastRefresh = {
    status: "error",
    at: now.toISOString(),
    error,
  };
}

export function markSyncSuccess(state: HealthState, now: Date = new Date()): void {
  state.lastSync = {
    status: "ok",
    at: now.toISOString(),
  };
}

export function markSyncFailure(state: HealthState, error: string, now: Date = new Date()): void {
  state.lastSync = {
    status: "error",
    at: now.toISOString(),
    error,
  };
}

function isRecentRefresh(state: HealthState, now: Date): boolean {
  if (!state.lastRefreshSuccessAt) {
    return false;
  }

  const lastRefreshAt = new Date(state.lastRefreshSuccessAt);
  if (Number.isNaN(lastRefreshAt.getTime())) {
    return false;
  }

  const maxAgeMs = Math.max(state.refreshIntervalMinutes * 2 * 60_000, 60_000);
  return now.getTime() - lastRefreshAt.getTime() <= maxAgeMs;
}

async function evaluateAuthHealth(state: HealthState, now: Date): Promise<{
  authenticated: boolean;
  tokenValid: boolean;
  refreshTokenPresent: boolean;
  refreshRecent: boolean;
  error?: string;
}> {
  try {
    const storedToken = await readTokenFile(state.credentialsFile);
    const token = normalizeToken(storedToken);

    return {
      authenticated: true,
      tokenValid: !isTokenExpired(token),
      refreshTokenPresent: typeof storedToken.refresh_token === "string" && storedToken.refresh_token.length > 0,
      refreshRecent: isRecentRefresh(state, now),
    };
  } catch (error) {
    return {
      authenticated: false,
      tokenValid: false,
      refreshTokenPresent: false,
      refreshRecent: isRecentRefresh(state, now),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildHealthResponse(state: HealthState, now: Date = new Date()): Promise<Response> {
  const auth = await evaluateAuthHealth(state, now);
  const healthy =
    state.ready &&
    !state.shuttingDown &&
    auth.authenticated &&
    auth.tokenValid &&
    auth.refreshTokenPresent &&
    auth.refreshRecent;

  const status = healthy ? "ok" : state.shuttingDown ? "stopping" : state.ready ? "error" : "starting";
  return jsonResponse({
    status,
    started_at: state.startedAt,
    now: now.toISOString(),
    ready: state.ready,
    shutting_down: state.shuttingDown,
    auth: {
      authenticated: auth.authenticated,
      token_valid: auth.tokenValid,
      refresh_token_present: auth.refreshTokenPresent,
      refresh_recent: auth.refreshRecent,
      error: auth.error,
    },
    last_refresh: state.lastRefresh,
    last_refresh_success_at: state.lastRefreshSuccessAt,
    last_sync: state.lastSync,
  }, healthy ? 200 : 503);
}

export function startHealthServer(options: {
  port: number;
  logger: Logger;
  state: HealthState;
}): Bun.Server<undefined> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port,
    routes: {
      "/health": async () => buildHealthResponse(options.state),
    },
    fetch() {
      return new Response("Not Found", { status: 404 });
    },
  });

  options.logger.info("Health endpoint started", {
    url: `http://127.0.0.1:${options.port}/health`,
  });

  return server;
}
