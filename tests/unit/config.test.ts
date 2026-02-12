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
      command: "dump",
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
      command: "dump",
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

  it("fails when sqlite output has no path", async () => {
    const dir = await makeTempDir();

    await expect(
      resolveConfig({
        command: "dump",
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
        command: "dump",
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
});
