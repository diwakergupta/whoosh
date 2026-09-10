import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveConfig } from "../../src/config/config";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "whoosh-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveConfig", () => {
  it("loads TOML config and resolves paths relative to config file", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "whoosh.toml");

    await fs.writeFile(
      configPath,
      `debug = "debug"\n\n[credentials]\nfile = "token-dir/token.toml"\n\n[export]\noutput = "sqlite"\n\n[export.sqlite]\npath = "data/whoosh.sqlite"\n`,
      "utf8",
    );

    const config = await resolveConfig({
      command: "sync",
      cli: { configPath },
      cwd: dir,
      env: {},
    });

    expect(config.debug).toBe("debug");
    expect(config.credentialsFile).toBe(path.join(dir, "token-dir", "token.toml"));
    expect(config.export.output).toBe("sqlite");
    expect(config.export.sqlitePath).toBe(path.join(dir, "data", "whoosh.sqlite"));
  });

  it("lets CLI flags override config values", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "whoosh.toml");

    await fs.writeFile(
      configPath,
      `[export]\noutput = "sqlite"\n\n[export.sqlite]\npath = "old.sqlite"\n\n[export.json]\npath = "old.json"\n`,
      "utf8",
    );

    const config = await resolveConfig({
      command: "sync",
      cli: {
        configPath,
        output: "json",
        jsonPath: path.join(dir, "new.json"),
      },
      cwd: dir,
      env: {},
    });

    expect(config.export.output).toBe("json");
    expect(config.export.jsonPath).toBe(path.join(dir, "new.json"));
  });

  it("resolves the server health port from config and CLI", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "whoosh.toml");

    await fs.writeFile(
      configPath,
      `[export]\noutput = "sqlite"\n\n[export.sqlite]\npath = "data.sqlite"\n\n[server]\nhealth_port = 9911\n`,
      "utf8",
    );

    const fromConfig = await resolveConfig({
      command: "server",
      cli: { configPath },
      cwd: dir,
      env: {},
    });

    const fromCli = await resolveConfig({
      command: "server",
      cli: { configPath, healthPort: "9922" },
      cwd: dir,
      env: {},
    });

    expect(fromConfig.server.healthPort).toBe(9911);
    expect(fromCli.server.healthPort).toBe(9922);
  });

  it("fails when sqlite output has no path", async () => {
    const dir = await makeTempDir();

    await expect(
      resolveConfig({
        command: "sync",
        cli: {},
        cwd: dir,
        env: {},
      }),
    ).rejects.toThrow("SQLite export requires a path");
  });

  it("fails when json output has no path", async () => {
    const dir = await makeTempDir();

    await expect(
      resolveConfig({
        command: "sync",
        cli: {
          output: "json",
        },
        cwd: dir,
        env: {},
      }),
    ).rejects.toThrow("JSON export requires a path");
  });

  it("defaults to token.toml when credentials path is not provided", async () => {
    const dir = await makeTempDir();
    const config = await resolveConfig({
      command: "login",
      cli: {},
      cwd: dir,
      env: {},
    });

    expect(config.credentialsFile).toBe(path.join(dir, "token.toml"));
  });

  it("fails when health port is invalid", async () => {
    const dir = await makeTempDir();

    await expect(
      resolveConfig({
        command: "server",
        cli: {
          output: "json",
          jsonPath: path.join(dir, "whoosh.json"),
          healthPort: "70000",
        },
        cwd: dir,
        env: {},
      }),
    ).rejects.toThrow("health port must be between 1 and 65535");
  });

  it("fails when server crontab is invalid", async () => {
    const dir = await makeTempDir();

    await expect(
      resolveConfig({
        command: "server",
        cli: {
          output: "json",
          jsonPath: path.join(dir, "whoosh.json"),
          crontab: "invalid cron expression",
        },
        cwd: dir,
        env: {},
      }),
    ).rejects.toThrow("Invalid server crontab");
  });

  it("accepts valid crontab expressions for server command", async () => {
    const dir = await makeTempDir();

    const config = await resolveConfig({
      command: "server",
      cli: {
        output: "json",
        jsonPath: path.join(dir, "whoosh.json"),
        crontab: "*/15 * * * *",
      },
      cwd: dir,
      env: {},
    });

    expect(config.server.crontab).toBe("*/15 * * * *");
  });
});

