import type { LogLevel } from "../util/logger";
import type { OutputFormat } from "./types";

export const DEFAULT_CONFIG_FILENAME = ".whoosh.toml";
export const DEFAULT_DEBUG_LEVEL: LogLevel = "info";
export const DEFAULT_CREDENTIALS_FILE = "token.toml";
export const DEFAULT_OUTPUT_FORMAT: OutputFormat = "sqlite";
export const DEFAULT_SERVER_CRONTAB = "0 13 * * *";
export const DEFAULT_JWT_REFRESH_MINUTES = 45;
export const DEFAULT_HEALTH_PORT = 8787;

export const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export const VALID_OUTPUT_FORMATS = ["sqlite", "json"] as const;
