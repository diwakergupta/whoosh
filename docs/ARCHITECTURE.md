# Architecture Overview

## Runtime model

- CLI process starts in `src/cli.ts`.
- Config is resolved once (CLI > ENV > TOML > defaults).
- Command handler executes one of: login, dump, server.

## Command flows

## `login`

1. Validate Whoop client env vars.
2. Build authorization URL via `openid-client`.
3. Start local Bun server and serve static pages.
4. Handle callback, exchange code for token.
5. Persist token as TOML.

## `dump`

1. Resolve output config (`sqlite` or `json`).
2. Read token file (TOML only).
3. Collect Whoop datasets sequentially.
4. Export to SQLite (normalized schema) or JSON.

## `server`

1. Resolve config and validate credentials.
2. Immediate token refresh on startup.
3. Schedule periodic token refresh job.
4. Schedule periodic dump job using Croner.
5. Retry transient failures; fail fast on unrecoverable auth.

## Data model

- Canonical in-memory dump shape is defined in `src/whoop/types.ts`.
- SQLite normalization is defined by `src/export/schema.sql`.
- Upsert behavior is implemented in `src/export/sqlite.ts`.

## Reliability controls

- Exponential backoff for transient HTTP failures.
- Token refresh retries for retryable failures.
- SQLite runs in WAL mode and writes within transactions.
- `dump_runs` table tracks run health and errors.
