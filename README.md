# whoosh

Minimal Bun CLI focused on reliability and ownership of Whoop data.

## Features

- OAuth login flow (`login`)
- one-shot data collection (`dump`)
- scheduled server mode with periodic token refresh (`server`)
- SQLite export by default
- optional JSON export

## Runtime choices

- Runtime/build/test: Bun
- Scheduler: Croner
- OAuth library: openid-client
- DB: `bun:sqlite` with WAL mode

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

### Dump (SQLite)

```bash
bun run src/cli.ts dump --db ./data/whoosh.sqlite
```

### Dump (JSON)

```bash
bun run src/cli.ts dump --output json --json-path ./data/whoosh.json
```

### Server mode

```bash
bun run src/cli.ts server --db ./data/whoosh.sqlite
```

## Behavior notes

- Endpoint fetches are sequential to avoid API burst spikes.
- Retry logic covers transient network/rate-limit/server errors.
- Unrecoverable auth failures are treated as fatal in server mode.
- Dump/server commands require explicit output path via CLI or config.

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
