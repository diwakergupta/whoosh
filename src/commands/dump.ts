import { normalizeToken, readTokenFile, isTokenExpired } from "../auth/token-store";
import { resolveConfig } from "../config/config";
import { exportToJson } from "../export/json";
import { exportToSqlite } from "../export/sqlite";
import { AppError } from "../util/errors";
import { createLogger } from "../util/logger";
import { WhoopClient } from "../whoop/client";

export interface DumpCliOptions {
  configPath?: string;
  credentialsFile?: string;
  debug?: string;
  filter?: string;
  output?: string;
  dbPath?: string;
  jsonPath?: string;
}

export async function runDumpCommand(cli: DumpCliOptions): Promise<void> {
  const config = await resolveConfig({
    command: "dump",
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

  const client = new WhoopClient({
    accessToken: token.accessToken,
    userAgent: "whoosh/0.1.0",
    logger,
  });

  const dump = await client.collectDump(cli.filter);

  if (config.export.output === "sqlite") {
    await exportToSqlite(dump, {
      dbPath: config.export.sqlitePath as string,
      mode: "dump",
      filter: cli.filter,
      logger,
    });
  } else {
    await exportToJson(dump, config.export.jsonPath as string, logger);
  }

  logger.info("Dump completed successfully");
}
