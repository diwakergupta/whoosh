import type { LogLevel } from "../util/logger";

export type OutputFormat = "sqlite" | "json";

export interface AppConfig {
  debug?: LogLevel;
  credentials?: {
    file?: string;
  };
  export?: {
    output?: OutputFormat;
    sqlite?: {
      path?: string;
    };
    json?: {
      path?: string;
    };
  };
  server?: {
    enabled?: boolean;
    crontab?: string;
    jwt_refresh_minutes?: number;
    health_port?: number;
  };
}

export interface EnvConfig {
  whoopClientId?: string;
  whoopClientSecret?: string;
  credentialsFile?: string;
}

export interface ResolvedConfig {
  debug: LogLevel;
  configFilePath?: string;
  credentialsFile: string;
  whoopClientId?: string;
  whoopClientSecret?: string;
  export: {
    output: OutputFormat;
    sqlitePath?: string;
    jsonPath?: string;
  };
  server: {
    crontab: string;
    jwtRefreshMinutes: number;
    healthPort: number;
  };
}

export interface ResolveConfigInput {
  command: "login" | "dump" | "sync" | "server";
  cli: {
    configPath?: string;
    credentialsFile?: string;
    debug?: string;
    output?: string;
    dbPath?: string;
    jsonPath?: string;
    crontab?: string;
    jwtRefreshMinutes?: string | number;
    healthPort?: string | number;
  };
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface LoadedConfig {
  config: AppConfig;
  path?: string;
}
