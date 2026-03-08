import { normalizeToken, readTokenFile, isTokenExpired } from "../auth/token-store";
import { resolveConfig } from "../config/config";
import { exportToJson } from "../export/json";
import { exportToSqlite } from "../export/sqlite";
import { planSyncWindow } from "../sync/planner";
import { AppError } from "../util/errors";
import { createLogger } from "../util/logger";
import { WhoopClient } from "../whoop/client";

export interface SyncCliOptions {
  configPath?: string;
  credentialsFile?: string;
  debug?: string;
  filter?: string;
  output?: string;
  dbPath?: string;
  jsonPath?: string;
}

export async function runSyncCommand(cli: SyncCliOptions): Promise<void> {
  const config = await resolveConfig({
    command: "sync",
    cli: {
      configPath: cli.configPath,
      credentialsFile: cli.credentialsFile,
      debug: cli.debug,
      output: cli.output,
      dbPath: cli.dbPath,
      jsonPath: cli.jsonPath,
    },
  });

  const logger = createLogger(config.debug);

  const rawToken = await readTokenFile(config.credentialsFile);
  const token = normalizeToken(rawToken);

  if (isTokenExpired(token)) {
    throw new AppError(
      "The existing token is expired. Run login again or use server mode for automatic refresh.",
      "AUTH",
    );
  }

  const plan = await planSyncWindow({
    output: config.export.output,
    dbPath: config.export.sqlitePath,
    filter: cli.filter,
  });

  if (plan.mode === "full") {
    logger.info("No prior sync state found. Running full sync.");
  } else if (plan.mode === "incremental") {
    logger.info("Resuming incremental sync", {
      start: plan.start,
      end: plan.end,
    });
  } else {
    logger.info("Using explicit sync filter", {
      filter: plan.filter,
    });
  }

  const client = new WhoopClient({
    accessToken: token.accessToken,
    userAgent: "whoosh/0.1.0",
    logger,
  });

  const dump = await client.collectDump(plan.filter);

  if (config.export.output === "sqlite") {
    await exportToSqlite(dump, {
      dbPath: config.export.sqlitePath as string,
      mode: "sync",
      filter: plan.filter,
      logger,
    });
  } else {
    await exportToJson(dump, config.export.jsonPath as string, logger);
  }

  logger.info("Sync completed successfully");
}
