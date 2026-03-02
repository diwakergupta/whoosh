# SQLite Schema Reference

Schema source of truth: `src/export/schema.sql`

## Design notes

- One persistent SQLite DB file.
- WAL mode enabled by exporter setup.
- Normalized relational tables by domain.
- `dump_runs` tracks every run and status.
- Records are upserted for idempotent re-runs.
- `local_date` is a canonical `YYYY-MM-DD` date for cross-app joins:
  - sleep/recovery use wake-day semantics (the day recovery applies)
  - workouts use the activity local day

## Table catalog

## Metadata tables

- `schema_migrations`
  - tracks applied schema versions
  - columns: `version` (PK), `applied_at`

- `dump_runs`
  - one row per dump/server run
  - columns: `id` (PK), `mode`, `filter`, `started_at`, `finished_at`, `status`, `error`

## User tables

- `user_profile`
  - one row per user
  - PK: `user_id`
  - columns: `email`, `first_name`, `last_name`, `run_id`, `updated_at`

- `user_measurements`
  - one row per user measurements snapshot
  - PK: `user_id`
  - columns: `height_meter`, `weight_kilogram`, `max_heart_rate`, `run_id`, `updated_at`

## Sleep tables

- `sleep_records`
  - parent table for sleep events
  - PK: `id`
  - columns: timestamps, timezone, nap flag, score state, `local_date`, `run_id`

- `sleep_score`
  - one-to-one with `sleep_records`
  - PK/FK: `sleep_id -> sleep_records.id`

- `sleep_stage_summary`
  - one-to-one with `sleep_records`
  - PK/FK: `sleep_id -> sleep_records.id`

- `sleep_needed`
  - one-to-one with `sleep_records`
  - PK/FK: `sleep_id -> sleep_records.id`

## Recovery tables

- `recovery_records`
  - parent table for recovery events
  - PK: `cycle_id`
  - columns include `local_date` (aligned to sleep wake day when available)

- `recovery_score`
  - one-to-one with `recovery_records`
  - PK/FK: `cycle_id -> recovery_records.cycle_id`

## Workout tables

- `workout_records`
  - parent table for workout events
  - PK: `id`
  - columns include `local_date` (local day derived from workout timestamps)

- `workout_score`
  - one-to-one with `workout_records`
  - PK/FK: `workout_id -> workout_records.id`

- `workout_zone_duration`
  - one-to-one with `workout_records`
  - PK/FK: `workout_id -> workout_records.id`

## Cycle tables

- `cycle_records`
  - parent table for cycle events
  - PK: `id`

- `cycle_score`
  - one-to-one with `cycle_records`
  - PK/FK: `cycle_id -> cycle_records.id`

## Indexes

- `idx_sleep_records_run_id`
- `idx_recovery_records_run_id`
- `idx_workout_records_run_id`
- `idx_cycle_records_run_id`
- `idx_sleep_records_local_date`
- `idx_recovery_records_local_date`
- `idx_workout_records_local_date`

## Relationship overview

- `dump_runs.id` references all domain record tables via `run_id`
- score/detail child tables reference their parent record tables with `ON DELETE CASCADE`

## Query examples

See `docs/QUERY_EXAMPLES.sql` for practical query snippets.
