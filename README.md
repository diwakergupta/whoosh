# whoosh

Minimal Bun CLI focused on reliability and ownership of Whoop data.

## Features

- OAuth login flow (`login`)
- one-shot and incremental data sync (`sync`)
- scheduled server mode with periodic token refresh (`server`)
- SQLite export by default
- optional JSON export

## Runtime choices

- Runtime/build/test: Bun
- Scheduler: Bun.cron (builtin)
- OAuth library: openid-client
- DB: `bun:sqlite` with WAL mode

## Logging

whoosh uses `pino` with `pino-pretty` for structured, single-line logs with timestamps.

- Service name is fixed to `whoosh`
- Level comes from `LOG_LEVEL` (defaults to `info`)
- Sensitive values are redacted (tokens/cookies/auth headers)
- Login callback server logs request start/end/error with `reqId` (`x-request-id` or generated UUID)

## Install

```bash
bun install
```

## Build executable

Create a self-contained native executable for the current platform:

```bash
bun run build
```

Output:

- `dist/whoosh`

Run it directly:

```bash
./dist/whoosh --help
```

Optional bundle-only build (non-executable JS output):

```bash
bun run build:bundle
```

## Environment

Required for `login` and `server`:

- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`

Optional:

- `WHOOP_CREDENTIALS_FILE`

You can copy `.env.example` to `.env`.

## Config

Config file format is TOML. If `--config` is omitted, the app checks `~/.whoosh.toml`.

### Example config

```toml
debug = "info"

[credentials]
file = "token.toml"

[export]
output = "sqlite" # sqlite | json

[export.sqlite]
path = "./data/whoosh.sqlite"

[export.json]
path = "./data/whoosh.json"

[server]
crontab = "0 13 * * *"
jwt_refresh_minutes = 45
health_port = 8787
```

## Token format

- Tokens are written as TOML (`token.toml` default).
- `login` defaults to writing `token.toml` (unless `--credentials` or `WHOOP_CREDENTIALS_FILE` overrides it).

## CLI usage

```bash
bun run src/cli.ts --help
```

### Login

```bash
bun run src/cli.ts login
```

Remote/server workflow (manual callback paste):

```bash
bun run src/cli.ts login --manual --no-auto-open
```

In manual mode, `whoosh` prints an authorization URL for your local browser. After authentication, the browser may show a redirect failure page; copy the full redirect URL and paste it back into the CLI prompt to complete token exchange.

### Sync (SQLite)

```bash
bun run src/cli.ts sync --db ./data/whoosh.sqlite
```

If the SQLite database already exists, `sync` resumes from the last successful sync boundary. The first run against a new database performs a full historical sync.

### Sync (JSON)

```bash
bun run src/cli.ts sync --output json --json-path ./data/whoosh.json
```

### Server mode

```bash
bun run src/cli.ts server --db ./data/whoosh.sqlite
```

In `server` mode, whoosh also serves `http://127.0.0.1:8787/health` by default. Override the port with `--health-port` or `[server].health_port`. The endpoint returns `200` only when startup has completed, the token file is present, the token is still valid, and a refresh has succeeded recently enough for the configured refresh cadence.

Example `process-compose.yaml` healthcheck using [`http_get`](https://f1bonacc1.github.io/process-compose/health/):

```yaml
processes:
  whoosh:
    command: bun run src/cli.ts server --db ./data/whoosh.sqlite
    availability:
      restart: always
    readiness_probe:
      http_get:
        host: 127.0.0.1
        port: 8787
        path: /health
      initial_delay_seconds: 2
      period_seconds: 10
      timeout_seconds: 2
      success_threshold: 1
      failure_threshold: 3
```

## Behavior notes

- Endpoint fetches are sequential to avoid API burst spikes.
- Retry logic covers transient network/rate-limit/server errors.
- Unrecoverable auth failures are treated as fatal in server mode.
- Sync/server commands require explicit output path via CLI or config.
- Server mode exposes a localhost `/health` endpoint for supervisors such as process-compose.

## Database schema

Schema SQL: `src/export/schema.sql`

Detailed schema docs: `docs/SCHEMA.md`

Sample SQL queries: `docs/QUERY_EXAMPLES.sql`

## Sample queries

```sql
-- Latest runs
SELECT id, mode, status, started_at, finished_at
FROM dump_runs
ORDER BY id DESC
LIMIT 10;
```

```sql
-- Sleep trend
SELECT r.start_time, s.sleep_performance_percentage
FROM sleep_records r
JOIN sleep_score s ON s.sleep_id = r.id
ORDER BY r.start_time DESC
LIMIT 30;
```

```sql
-- Recent workouts
SELECT wr.start_time, wr.sport_name, ws.strain, ws.distance_meter
FROM workout_records wr
JOIN workout_score ws ON ws.workout_id = wr.id
ORDER BY wr.start_time DESC
LIMIT 30;
```

## Development

```bash
bun run typecheck
bun test
bun run check
```

## Repository docs

- Agent workflow: `AGENTS.md`
- Contribution guide: `CONTRIBUTING.md`
- Architecture notes: `docs/ARCHITECTURE.md`
- Schema reference: `docs/SCHEMA.md`
- SQL query examples: `docs/QUERY_EXAMPLES.sql`

## License

Apache License 2.0. See `LICENSE`.
