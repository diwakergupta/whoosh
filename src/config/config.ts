import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_CREDENTIALS_FILE,
  DEFAULT_DEBUG_LEVEL,
  DEFAULT_HEALTH_PORT,
  DEFAULT_JWT_REFRESH_MINUTES,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_SERVER_CRONTAB,
} from "./defaults";
import { readEnv } from "./env";
import { validateAppConfig } from "./schema";
import type { AppConfig, LoadedConfig, ResolveConfigInput, ResolvedConfig } from "./types";
import { AppError } from "../util/errors";
import { toAbsolutePath } from "../util/path";

function resolveCandidateConfigPath(configPath: string | undefined, cwd: string): { candidate?: string; explicit: boolean } {
  if (configPath) {
    return {
      candidate: toAbsolutePath(configPath, cwd),
      explicit: true,
    };
  }

  const candidate = path.join(os.homedir(), DEFAULT_CONFIG_FILENAME);
  return {
    candidate,
    explicit: false,
  };
}

export async function loadConfig(configPath: string | undefined, cwd: string = process.cwd()): Promise<LoadedConfig> {
  const { candidate, explicit } = resolveCandidateConfigPath(configPath, cwd);
  if (!candidate) {
    return { config: {} };
  }

  try {
    await fs.access(candidate);
  } catch {
    if (explicit) {
      throw new AppError(`Config file not found: ${candidate}`, "CONFIG");
    }
    return { config: {} };
  }

  const raw = await fs.readFile(candidate, "utf8");
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(raw);
  } catch (error) {
    throw new AppError(`Failed to parse TOML config file: ${candidate}`, "CONFIG", { cause: error });
  }

  const config = validateAppConfig(parsed);
  return {
    config,
    path: candidate,
  };
}

function pickPath(value: string | undefined, baseDir: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return toAbsolutePath(value, baseDir);
}

function toLogLevel(value: string | undefined): ResolvedConfig["debug"] {
  if (!value) {
    return DEFAULT_DEBUG_LEVEL;
  }
  const normalized = value.toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  throw new AppError(`Invalid debug level \"${value}\". Use debug|info|warn|error.`, "VALIDATION");
}

function toOutputFormat(value: string | undefined): ResolvedConfig["export"]["output"] {
  if (!value) {
    return DEFAULT_OUTPUT_FORMAT;
  }
  const normalized = value.toLowerCase();
  if (normalized === "sqlite" || normalized === "json") {
    return normalized;
  }
  throw new AppError(`Invalid output format \"${value}\". Use sqlite|json.`, "VALIDATION");
}

function toJwtRefreshMinutes(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_JWT_REFRESH_MINUTES;
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 59) {
    return DEFAULT_JWT_REFRESH_MINUTES;
  }
  return parsed;
}

function toPort(value: string | number | undefined, fallback: number, fieldName: string): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new AppError(`${fieldName} must be between 1 and 65535.`, "VALIDATION");
  }

  return parsed;
}

function toCrontab(value: string | undefined): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_SERVER_CRONTAB;
  }
  const trimmed = value.trim();
  try {
    Bun.cron.parse(trimmed);
  } catch (error) {
    throw new AppError(
      `Invalid server crontab "${value}": ${error instanceof Error ? error.message : String(error)}`,
      "VALIDATION",
    );
  }
  return trimmed;
}

function requireExporterPath(output: "sqlite" | "json", sqlitePath: string | undefined, jsonPath: string | undefined): void {
  if (output === "sqlite" && !sqlitePath) {
    throw new AppError("SQLite export requires a path. Set --db or export.sqlite.path in config.", "VALIDATION");
  }

  if (output === "json" && !jsonPath) {
    throw new AppError("JSON export requires a path. Set --json-path or export.json.path in config.", "VALIDATION");
  }
}

function ensureObject(value: AppConfig["export"] | undefined): NonNullable<AppConfig["export"]> {
  return value ?? {};
}

export async function resolveConfig(input: ResolveConfigInput): Promise<ResolvedConfig> {
  const cwd = input.cwd ?? process.cwd();
  const loaded = await loadConfig(input.cli.configPath, cwd);
  const fileConfig = loaded.config;
  const envConfig = readEnv(input.env);

  const configBaseDir = loaded.path ? path.dirname(loaded.path) : cwd;

  const debug = toLogLevel(input.cli.debug ?? fileConfig.debug ?? DEFAULT_DEBUG_LEVEL);

  const credentialsFromConfig = pickPath(fileConfig.credentials?.file, configBaseDir);
  const credentialsFromEnv = pickPath(envConfig.credentialsFile, cwd);
  const credentialsFromCli = pickPath(input.cli.credentialsFile, cwd);

  const credentialsFile =
    credentialsFromCli ?? credentialsFromEnv ?? credentialsFromConfig ?? path.resolve(cwd, DEFAULT_CREDENTIALS_FILE);

  const exportBlock = ensureObject(fileConfig.export);
  const output = toOutputFormat(input.cli.output ?? exportBlock.output ?? DEFAULT_OUTPUT_FORMAT);
  const sqlitePath = pickPath(input.cli.dbPath, cwd) ?? pickPath(exportBlock.sqlite?.path, configBaseDir);
  const jsonPath = pickPath(input.cli.jsonPath, cwd) ?? pickPath(exportBlock.json?.path, configBaseDir);

  if (input.command === "dump" || input.command === "sync" || input.command === "server") {
    requireExporterPath(output, sqlitePath, jsonPath);
  }

  const crontab = input.command === "server"
    ? toCrontab(input.cli.crontab ?? fileConfig.server?.crontab)
    : (input.cli.crontab ?? fileConfig.server?.crontab ?? DEFAULT_SERVER_CRONTAB);
  const jwtRefreshMinutes = toJwtRefreshMinutes(input.cli.jwtRefreshMinutes ?? fileConfig.server?.jwt_refresh_minutes);
  const healthPort = toPort(input.cli.healthPort ?? fileConfig.server?.health_port, DEFAULT_HEALTH_PORT, "health port");

  return {
    debug,
    configFilePath: loaded.path,
    credentialsFile,
    whoopClientId: envConfig.whoopClientId,
    whoopClientSecret: envConfig.whoopClientSecret,
    export: {
      output,
      sqlitePath,
      jsonPath,
    },
    server: {
      crontab,
      jwtRefreshMinutes,
      healthPort,
    },
  };
}

export function requireWhoopClientCredentials(config: ResolvedConfig): { clientId: string; clientSecret: string } {
  if (!config.whoopClientId || !config.whoopClientSecret) {
    throw new AppError(
      "WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET are required for this command.",
      "VALIDATION",
    );
  }

  return {
    clientId: config.whoopClientId,
    clientSecret: config.whoopClientSecret,
  };
}
