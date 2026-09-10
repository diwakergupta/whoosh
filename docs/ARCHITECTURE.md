# Architecture Overview

## Runtime model

- CLI process starts in `src/cli.ts`.
- Config is resolved once (CLI > ENV > TOML > defaults).
- Command handler executes one of: login, sync, server.

## Command flows

## `login`

1. Validate Whoop client env vars.
2. Build authorization URL via `openid-client`.
3. Run local callback server flow or manual callback-paste flow.
4. Validate callback state/path and exchange code for token.
5. Persist token as TOML.

## `sync`

1. Resolve output config (`sqlite` or `json`).
2. Read token file (TOML only).
3. Use the last successful SQLite run as the incremental boundary when prior state exists.
4. Collect Whoop datasets sequentially.
5. Export to SQLite (normalized schema) or JSON.

## `server`

1. Resolve config and validate credentials.
2. Immediate token refresh on startup.
3. Schedule periodic token refresh job.
4. Serve `GET /health` on a localhost health port for supervisors.
5. Schedule periodic sync job using Bun.cron.
6. Retry transient failures; fail fast on unrecoverable auth.

## Data model

- Canonical in-memory sync payload shape is defined in `src/whoop/types.ts`.
- SQLite normalization is defined by `src/export/schema.sql`.
- Upsert behavior is implemented in `src/export/sqlite.ts`.

## Reliability controls

- Exponential backoff for transient HTTP failures.
- Token refresh retries for retryable failures.
- SQLite runs in WAL mode and writes within transactions.
- `dump_runs` table tracks sync/server run health and errors.
