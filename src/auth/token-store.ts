import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../util/errors";

export interface StoredToken {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  expires_at?: string | number;
  expiry?: string;
}

export interface NormalizedToken {
  accessToken: string;
  tokenType?: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: Date;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStoredToken(value: Record<string, unknown>): StoredToken {
  return {
    access_token: typeof value.access_token === "string" ? value.access_token : "",
    token_type: typeof value.token_type === "string" ? value.token_type : undefined,
    refresh_token: typeof value.refresh_token === "string" ? value.refresh_token : undefined,
    scope: typeof value.scope === "string" ? value.scope : undefined,
    expires_in: typeof value.expires_in === "number" ? value.expires_in : undefined,
    expires_at:
      typeof value.expires_at === "number" || typeof value.expires_at === "string"
        ? value.expires_at
        : undefined,
    expiry: typeof value.expiry === "string" ? value.expiry : undefined,
  };
}

function parseExpiresAt(value: StoredToken): Date | undefined {
  if (typeof value.expires_at === "number") {
    return new Date(value.expires_at * 1000);
  }
  if (typeof value.expires_at === "string") {
    const parsed = new Date(value.expires_at);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (typeof value.expiry === "string") {
    const parsed = new Date(value.expiry);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return undefined;
}

function parseToken(value: unknown): StoredToken {
  if (!isObject(value)) {
    throw new AppError("Token file is not a valid object.", "AUTH");
  }

  const token = toStoredToken(value);
  if (!token.access_token || typeof token.access_token !== "string") {
    throw new AppError("Token file does not contain access_token.", "AUTH");
  }

  return token;
}

function parseTokenToml(raw: string): StoredToken {
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(raw);
  } catch (error) {
    throw new AppError("Token file is not valid TOML.", "AUTH", { cause: error });
  }
  return parseToken(parsed);
}

function escapeTomlString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("\n", "\\n");
}

function toTomlLine(key: string, value: string | number): string {
  if (typeof value === "number") {
    return `${key} = ${value}`;
  }
  return `${key} = "${escapeTomlString(value)}"`;
}

export function serializeTokenToml(token: StoredToken): string {
  const lines: string[] = [];
  lines.push(toTomlLine("access_token", token.access_token));

  if (token.token_type !== undefined) {
    lines.push(toTomlLine("token_type", token.token_type));
  }
  if (token.refresh_token !== undefined) {
    lines.push(toTomlLine("refresh_token", token.refresh_token));
  }
  if (token.scope !== undefined) {
    lines.push(toTomlLine("scope", token.scope));
  }
  if (token.expires_in !== undefined) {
    lines.push(toTomlLine("expires_in", token.expires_in));
  }
  if (token.expires_at !== undefined) {
    lines.push(toTomlLine("expires_at", token.expires_at));
  }
  if (token.expiry !== undefined) {
    lines.push(toTomlLine("expiry", token.expiry));
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Read token from TOML only.
 */
export async function readTokenFile(tokenPath: string): Promise<StoredToken> {
  let raw: string;
  try {
    raw = await fs.readFile(tokenPath, "utf8");
  } catch (error) {
    throw new AppError(`Unable to read token file: ${tokenPath}`, "AUTH", { cause: error });
  }

  try {
    return parseTokenToml(raw);
  } catch (tomlError) {
    throw new AppError(`Token file is not valid TOML: ${tokenPath}`, "AUTH", {
      cause: tomlError,
    });
  }
}

/**
 * Persist token as TOML using atomic replace semantics.
 */
export async function writeTokenFile(tokenPath: string, token: StoredToken): Promise<void> {
  if (!token.access_token) {
    throw new AppError("Cannot write token file without access_token.", "VALIDATION");
  }

  const dir = path.dirname(tokenPath);
  await fs.mkdir(dir, { recursive: true });

  const tempPath = `${tokenPath}.tmp-${process.pid}-${Date.now()}`;
  const content = serializeTokenToml(token);

  await fs.writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tempPath, tokenPath);

  try {
    await fs.chmod(tokenPath, 0o600);
  } catch {
    // Best effort only, some platforms ignore chmod semantics.
  }
}

export function normalizeToken(token: StoredToken): NormalizedToken {
  return {
    accessToken: token.access_token,
    tokenType: token.token_type,
    refreshToken: token.refresh_token,
    scope: token.scope,
    expiresAt: parseExpiresAt(token),
  };
}

export function isTokenExpired(token: NormalizedToken, skewSeconds = 60): boolean {
  if (!token.expiresAt) {
    return false;
  }
  return token.expiresAt.getTime() - skewSeconds * 1000 <= Date.now();
}
