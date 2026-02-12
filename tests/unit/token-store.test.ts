import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isTokenExpired,
  normalizeToken,
  readTokenFile,
  serializeTokenToml,
  writeTokenFile,
} from "../../src/auth/token-store";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "whoosh-token-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("token store", () => {
  it("writes and reads token files", async () => {
    const dir = await makeTempDir();
    const tokenPath = path.join(dir, "token.toml");

    await writeTokenFile(tokenPath, {
      access_token: "abc",
      refresh_token: "def",
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const token = await readTokenFile(tokenPath);
    expect(token.access_token).toBe("abc");
    expect(token.refresh_token).toBe("def");
  });

  it("rejects non-TOML token files", async () => {
    const dir = await makeTempDir();
    const tokenPath = path.join(dir, "token.toml");
    await fs.writeFile(
      tokenPath,
      JSON.stringify({
        access_token: "legacy",
        refresh_token: "legacy-refresh",
      }),
      "utf8",
    );

    await expect(readTokenFile(tokenPath)).rejects.toThrow("not valid TOML");
  });

  it("normalizes legacy expiry field", () => {
    const normalized = normalizeToken({
      access_token: "abc",
      expiry: "2030-01-01T00:00:00.000Z",
    });

    expect(normalized.expiresAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });

  it("detects expiration with skew", () => {
    const expired = normalizeToken({
      access_token: "abc",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    });

    const valid = normalizeToken({
      access_token: "abc",
      expires_at: new Date(Date.now() + 120_000).toISOString(),
    });

    expect(isTokenExpired(expired)).toBe(true);
    expect(isTokenExpired(valid)).toBe(false);
  });

  it("serializes token to TOML", () => {
    const output = serializeTokenToml({
      access_token: "abc",
      refresh_token: "def",
      expires_in: 3600,
    });

    expect(output).toContain("access_token = \"abc\"");
    expect(output).toContain("refresh_token = \"def\"");
    expect(output).toContain("expires_in = 3600");
  });
});
