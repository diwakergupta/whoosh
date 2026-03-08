#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runLoginCommand } from "./commands/login";
import { runServerCommand } from "./commands/server";
import { runSyncCommand } from "./commands/sync";
import { getErrorCauseMessages, isAppError } from "./util/errors";
import { createLogger } from "./util/logger";

function printRootHelp(): void {
  process.stdout.write(`whoosh\n\nUsage:\n  whoosh <command> [options]\n\nCommands:\n  login   Run OAuth login flow and save token file\n  sync    Fetch Whoop data and export it (full first run, incremental afterward)\n  server  Run scheduled token refresh + data sync\n\nGlobal options:\n  --config <path>        TOML config file path\n  --credentials <path>   Token file path (default: token.toml)\n  -d, --debug <level>    debug|info|warn|error\n  --help                 Show help\n\nRun command help:\n  whoosh <command> --help\n`);
}

function printLoginHelp(): void {
  process.stdout.write(`Usage: whoosh login [options]\n\nOptions:\n  --config <path>\n  --credentials <path>\n  -d, --debug <level>\n  -p, --port <port>                  Default: 8080\n  -r, --redirect-path <path>         Default: /redirect\n  -m, --manual                       Paste callback URL instead of running local callback server\n  -n, --no-auto-open                 Do not auto-open browser\n  --help\n`);
}

function printSyncHelp(): void {
  process.stdout.write(`Usage: whoosh sync [options]\n\nOptions:\n  --config <path>\n  --credentials <path>\n  -d, --debug <level>\n  -f, --filter <query>               Whoop filter query string (overrides incremental default)\n  -o, --output <sqlite|json>         Default: sqlite\n  --db <path>                        Required when output=sqlite\n  --json-path <path>                 Required when output=json\n  --help\n`);
}

function printServerHelp(): void {
  process.stdout.write(`Usage: whoosh server [options]\n\nOptions:\n  --config <path>\n  --credentials <path>\n  -d, --debug <level>\n  -o, --output <sqlite|json>         Default: sqlite\n  --db <path>                        Required when output=sqlite\n  --json-path <path>                 Required when output=json\n  --crontab <expr>                   Default: 0 13 * * *\n  --jwt-refresh-minutes <1-59>       Default: 45\n  --health-port <port>               Default: 8787 (serves /health on 127.0.0.1)\n  --help\n`);
}

function extractCommand(args: string[]): { command?: string; commandArgs: string[] } {
  if (args.length === 0) {
    return { commandArgs: args };
  }

  const first = args[0];
  if (first.startsWith("-")) {
    return { commandArgs: args };
  }

  return {
    command: first,
    commandArgs: args.slice(1),
  };
}

async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const { command, commandArgs } = extractCommand(args);

  if (!command) {
    const parsed = parseArgs({
      args: commandArgs,
      options: {
        help: { type: "boolean" },
      },
      strict: false,
      allowPositionals: true,
    });

    if (parsed.values.help || commandArgs.length === 0) {
      printRootHelp();
      return;
    }

    throw new Error("Missing command. Run --help for usage.");
  }

  if (command === "help") {
    printRootHelp();
    return;
  }

  switch (command) {
    case "login": {
      const parsed = parseArgs({
        args: commandArgs,
        options: {
          config: { type: "string" },
          credentials: { type: "string" },
          debug: { type: "string", short: "d" },
          port: { type: "string", short: "p" },
          "redirect-path": { type: "string", short: "r" },
          manual: { type: "boolean", short: "m" },
          "no-auto-open": { type: "boolean", short: "n" },
          help: { type: "boolean" },
        },
        strict: true,
      });

      if (parsed.values.help) {
        printLoginHelp();
        return;
      }

      await runLoginCommand({
        configPath: parsed.values.config,
        credentialsFile: parsed.values.credentials,
        debug: parsed.values.debug,
        port: parsed.values.port,
        redirectPath: parsed.values["redirect-path"],
        manual: parsed.values.manual ?? false,
        noAutoOpen: parsed.values["no-auto-open"] ?? false,
      });
      return;
    }

    case "sync":
    case "dump": {
      const parsed = parseArgs({
        args: commandArgs,
        options: {
          config: { type: "string" },
          credentials: { type: "string" },
          debug: { type: "string", short: "d" },
          filter: { type: "string", short: "f" },
          output: { type: "string", short: "o" },
          db: { type: "string" },
          "json-path": { type: "string" },
          help: { type: "boolean" },
        },
        strict: true,
      });

      if (parsed.values.help) {
        printSyncHelp();
        return;
      }

      await runSyncCommand({
        configPath: parsed.values.config,
        credentialsFile: parsed.values.credentials,
        debug: parsed.values.debug,
        filter: parsed.values.filter,
        output: parsed.values.output,
        dbPath: parsed.values.db,
        jsonPath: parsed.values["json-path"],
      });
      return;
    }

    case "server": {
      const parsed = parseArgs({
        args: commandArgs,
        options: {
          config: { type: "string" },
          credentials: { type: "string" },
          debug: { type: "string", short: "d" },
          output: { type: "string", short: "o" },
          db: { type: "string" },
          "json-path": { type: "string" },
          crontab: { type: "string" },
          "jwt-refresh-minutes": { type: "string" },
          "health-port": { type: "string" },
          help: { type: "boolean" },
        },
        strict: true,
      });

      if (parsed.values.help) {
        printServerHelp();
        return;
      }

      await runServerCommand({
        configPath: parsed.values.config,
        credentialsFile: parsed.values.credentials,
        debug: parsed.values.debug,
        output: parsed.values.output,
        dbPath: parsed.values.db,
        jsonPath: parsed.values["json-path"],
        crontab: parsed.values.crontab,
        jwtRefreshMinutes: parsed.values["jwt-refresh-minutes"],
        healthPort: parsed.values["health-port"],
      });
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

const logger = createLogger();

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    error: error instanceof Error ? error.message : String(error),
  });
});

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection", {
    error: error instanceof Error ? error.message : String(error),
  });
});

main(Bun.argv).catch((error) => {
  if (isAppError(error)) {
    logger.error("Command failed", {
      code: error.code,
      error: error.message,
      causes: getErrorCauseMessages(error).slice(1),
    });
    process.exit(1);
    return;
  }

  logger.error("Command failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
