import { AppError } from "../util/errors";
import { VALID_LOG_LEVELS, VALID_OUTPUT_FORMATS } from "./defaults";
import type { AppConfig } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateAppConfig(value: unknown): AppConfig {
  if (!isObject(value)) {
    throw new AppError("Config root must be a TOML table/object.", "CONFIG");
  }

  const config = value as AppConfig;

  if (config.debug !== undefined && !VALID_LOG_LEVELS.includes(config.debug)) {
    throw new AppError(`Invalid debug level \"${config.debug}\". Use debug|info|warn|error.`, "CONFIG");
  }

  if (config.export?.output !== undefined && !VALID_OUTPUT_FORMATS.includes(config.export.output)) {
    throw new AppError(`Invalid export.output \"${config.export.output}\". Use sqlite|json.`, "CONFIG");
  }

  if (config.server?.jwt_refresh_minutes !== undefined) {
    const value = config.server.jwt_refresh_minutes;
    if (!Number.isFinite(value) || value <= 0) {
      throw new AppError("server.jwt_refresh_minutes must be a positive number.", "CONFIG");
    }
  }

  if (config.server?.health_port !== undefined) {
    const value = config.server.health_port;
    if (!Number.isFinite(value) || value <= 0 || value > 65535) {
      throw new AppError("server.health_port must be between 1 and 65535.", "CONFIG");
    }
  }

  return config;
}
