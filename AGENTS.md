# AGENTS.md

Guidance for agents working in this repository.

## 1) Project intent

`whoosh` is a Bun/TypeScript CLI for Whoop data ownership with these intentional boundaries:

- commands: `login`, `dump`, `server`
- exports: `sqlite` (default), `json` (optional)
- no S3/XLSX/plugin framework in this repo
- config file format: TOML
- token persistence format: TOML (`token.toml` default)

## 2) Fast local loop

- install: `bun install`
- typecheck: `bun run typecheck`
- tests: `bun test`
- full check: `bun run check`
- build self-contained executable: `bun run build`
- command help: `bun run src/cli.ts --help`

Do not merge changes without passing `bun run check`.

## 3) Repository map

- CLI entrypoint: `src/cli.ts`
- command handlers: `src/commands/`
- config/env/default resolution: `src/config/`
- OAuth/token handling: `src/auth/`
- Whoop API client + retry: `src/whoop/`
- exporters and schema: `src/export/`
- static login pages: `src/web/`
- tests: `tests/`
- schema docs: `docs/SCHEMA.md`
- sample SQL queries: `docs/QUERY_EXAMPLES.sql`

## 4) Behavioral contracts

- Config precedence is strict: CLI > ENV > TOML config > defaults.
- `dump` and `server` must fail validation when required output paths are missing.
- Data collection is intentionally sequential to reduce API burst pressure.
- Retry transient failures (network/429/retryable 5xx) with bounded backoff.
- Treat auth failures (`401/403`, invalid token/refresh) as unrecoverable.
- SQLite uses a single persistent DB and WAL mode.

## 5) Token format and compatibility

- Write tokens as TOML.
- Read tokens as TOML only.
- Never log full access/refresh tokens.

## 6) Database and schema rules

- Schema source of truth: `src/export/schema.sql`.
- Use normalized tables; avoid JSON columns.
- Maintain migration versioning via `schema_migrations`.
- If schema changes, update all of:
  - `src/export/schema.sql`
  - `src/export/sqlite.ts`
  - `docs/SCHEMA.md`
  - `docs/QUERY_EXAMPLES.sql` (if queries are impacted)
  - relevant tests in `tests/integration/sqlite-export.test.ts`

## 7) Coding standards

- Keep changes small and explicit; favor readable, defensive code.
- Add comments only where behavior is non-obvious.
- Preserve strict typing (`tsc --noEmit` clean).
- Prefer deterministic tests with no outbound network.

## 8) Test strategy expectations

For command/data-path changes, add or update tests in the right layer:

- unit: pure helpers, config precedence, token parsing, retry logic
- integration: exporter and Whoop client behavior with mocked fetch
- e2e smoke: CLI ergonomics/help and command wiring

## 9) Release/split-repo housekeeping

When preparing a standalone repo release:

- verify `.gitignore` excludes local secrets and runtime artifacts
- include `.env.example` but never `.env`
- ensure README + docs reflect current CLI flags and schema
- run `bun run check` before tagging
