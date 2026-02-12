import { Cron } from "croner";
import { createOAuthClient, refreshAccessToken } from "../auth/oauth";
import { isTokenExpired, normalizeToken, readTokenFile, writeTokenFile } from "../auth/token-store";
import { requireWhoopClientCredentials, resolveConfig } from "../config/config";
import { exportToJson } from "../export/json";
import { exportToSqlite } from "../export/sqlite";
import { AppError, isAppError, isAuthError } from "../util/errors";
import { createLogger } from "../util/logger";
import { buildFilter, last24HoursRange } from "../util/time";
import { WhoopClient } from "../whoop/client";
import { retryAsync } from "../whoop/retry";

export interface ServerCliOptions {
  configPath?: string;
  credentialsFile?: string;
  debug?: string;
  output?: string;
  dbPath?: string;
  jsonPath?: string;
  crontab?: string;
  jwtRefreshMinutes?: string;
}

function isRetryable(error: unknown): boolean {
  return isAppError(error) && (error.code === "RETRYABLE" || error.retryable);
}

async function refreshTokenFile(params: {
  credentialsFile: string;
  clientId: string;
  clientSecret: string;
  logger: ReturnType<typeof createLogger>;
}): Promise<void> {
  const currentToken = await readTokenFile(params.credentialsFile);
  if (!currentToken.refresh_token) {
    throw new AppError("Token file does not contain refresh_token. Run login again.", "AUTH");
  }

  const oauthClient = createOAuthClient(params.clientId, params.clientSecret);

  const refreshed = await retryAsync(
    async () => refreshAccessToken({
      client: oauthClient,
      refreshToken: currentToken.refresh_token as string,
    }),
    {
      shouldRetry: isRetryable,
      onRetry: (attempt, delayMs, error) => {
        params.logger.warn("Token refresh retry", {
          attempt,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    },
  );

  if (!refreshed.refresh_token) {
    refreshed.refresh_token = currentToken.refresh_token;
  }

  await writeTokenFile(params.credentialsFile, refreshed);
}

export async function runServerCommand(cli: ServerCliOptions): Promise<void> {
  const config = await resolveConfig({
    command: "server",
    cli: {
      configPath: cli.configPath,
      credentialsFile: cli.credentialsFile,
      debug: cli.debug,
      output: cli.output,
      dbPath: cli.dbPath,
      jsonPath: cli.jsonPath,
      crontab: cli.crontab,
      jwtRefreshMinutes: cli.jwtRefreshMinutes,
    },
  });

  const logger = createLogger(config.debug);
  const { clientId, clientSecret } = requireWhoopClientCredentials(config);

  let settled = false;
  let resolveDone: (() => void) | undefined;
  let rejectDone: ((error: unknown) => void) | undefined;

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  function fatal(error: unknown): void {
    if (settled) {
      return;
    }
    settled = true;
    rejectDone?.(error);
  }

  async function runRefreshJob(reason: string): Promise<void> {
    try {
      await refreshTokenFile({
        credentialsFile: config.credentialsFile,
        clientId,
        clientSecret,
        logger,
      });
      logger.info("Token refresh successful", { reason });
    } catch (error) {
      if (isAuthError(error)) {
        logger.error("Token refresh failed with unrecoverable auth error", {
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
        fatal(error);
        return;
      }

      logger.warn("Token refresh failed (transient). Server will continue.", {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function runDumpJob(reason: string): Promise<void> {
    try {
      let token = normalizeToken(await readTokenFile(config.credentialsFile));

      if (isTokenExpired(token)) {
        logger.warn("Token is expired before dump. Triggering refresh.", { reason });
        await runRefreshJob("pre-dump");
        token = normalizeToken(await readTokenFile(config.credentialsFile));
      }

      if (isTokenExpired(token)) {
        throw new AppError("Token remains expired after refresh attempt.", "AUTH");
      }

      const { start, end } = last24HoursRange();
      const filter = buildFilter(start, end);
      const client = new WhoopClient({
        accessToken: token.accessToken,
        userAgent: "whoosh/0.1.0",
        logger,
      });

      const dump = await client.collectDump(filter);

      if (config.export.output === "sqlite") {
        await exportToSqlite(dump, {
          dbPath: config.export.sqlitePath as string,
          mode: "server",
          filter,
          logger,
        });
      } else {
        await exportToJson(dump, config.export.jsonPath as string, logger);
      }

      logger.info("Scheduled dump completed", { reason });
    } catch (error) {
      if (isAuthError(error)) {
        logger.error("Data collection failed with auth error. Server will exit.", {
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
        fatal(error);
        return;
      }

      logger.warn("Data collection failed with transient/fatal non-auth error; server will continue.", {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await runRefreshJob("startup");

  const refreshPattern = `*/${config.server.jwtRefreshMinutes} * * * *`;
  const refreshCron = new Cron(
    refreshPattern,
    {
      protect: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      catch: (error) => {
        logger.warn("Unhandled refresh cron callback error", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    },
    () => {
      void runRefreshJob("scheduled-refresh");
    },
  );

  const dumpCron = new Cron(
    config.server.crontab,
    {
      protect: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      catch: (error) => {
        logger.warn("Unhandled dump cron callback error", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    },
    () => {
      void runDumpJob("scheduled-dump");
    },
  );

  logger.info("Server mode started", {
    crontab: config.server.crontab,
    jwtRefreshMinutes: config.server.jwtRefreshMinutes,
    output: config.export.output,
  });

  const handleSignal = (signal: NodeJS.Signals): void => {
    logger.info("Shutdown signal received", { signal });
    if (!settled) {
      settled = true;
      resolveDone?.();
    }
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    await done;
  } finally {
    refreshCron.stop();
    dumpCron.stop();
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    logger.info("Server mode stopped");
  }
}
