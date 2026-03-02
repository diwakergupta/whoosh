-- whoosh SQLite schema
--
-- Principles:
-- 1) Normalized relational model (no JSON columns).
-- 2) Idempotent upsert writes across repeated runs.
-- 3) Run metadata tracked in dump_runs.

-- Applied schema versions.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- One row per dump/server export execution.
CREATE TABLE IF NOT EXISTS dump_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  filter TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  error TEXT
);

-- User profile snapshot keyed by user id.
CREATE TABLE IF NOT EXISTS user_profile (
  user_id INTEGER PRIMARY KEY,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  run_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- User body measurements keyed by user id.
CREATE TABLE IF NOT EXISTS user_measurements (
  user_id INTEGER PRIMARY KEY,
  height_meter REAL,
  weight_kilogram REAL,
  max_heart_rate INTEGER,
  run_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Sleep parent records.
CREATE TABLE IF NOT EXISTS sleep_records (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  created_at TEXT,
  updated_at TEXT,
  start_time TEXT,
  end_time TEXT,
  timezone_offset TEXT,
  nap INTEGER,
  score_state TEXT,
  local_date TEXT,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Sleep score summary fields.
CREATE TABLE IF NOT EXISTS sleep_score (
  sleep_id TEXT PRIMARY KEY,
  respiratory_rate REAL,
  sleep_performance_percentage REAL,
  sleep_consistency_percentage REAL,
  sleep_efficiency_percentage REAL,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (sleep_id) REFERENCES sleep_records(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Sleep stage sub-structure.
CREATE TABLE IF NOT EXISTS sleep_stage_summary (
  sleep_id TEXT PRIMARY KEY,
  total_in_bed_time_milli INTEGER,
  total_awake_time_milli INTEGER,
  total_no_data_time_milli INTEGER,
  total_light_sleep_time_milli INTEGER,
  total_slow_wave_sleep_time_milli INTEGER,
  total_rem_sleep_time_milli INTEGER,
  sleep_cycle_count INTEGER,
  disturbance_count INTEGER,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (sleep_id) REFERENCES sleep_records(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Sleep needed sub-structure.
CREATE TABLE IF NOT EXISTS sleep_needed (
  sleep_id TEXT PRIMARY KEY,
  baseline_milli INTEGER,
  need_from_sleep_debt_milli INTEGER,
  need_from_recent_strain_milli INTEGER,
  need_from_recent_nap_milli INTEGER,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (sleep_id) REFERENCES sleep_records(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Recovery parent records.
CREATE TABLE IF NOT EXISTS recovery_records (
  cycle_id INTEGER PRIMARY KEY,
  sleep_id TEXT,
  user_id INTEGER,
  created_at TEXT,
  updated_at TEXT,
  score_state TEXT,
  local_date TEXT,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Recovery score fields.
CREATE TABLE IF NOT EXISTS recovery_score (
  cycle_id INTEGER PRIMARY KEY,
  user_calibrating INTEGER,
  recovery_score REAL,
  resting_heart_rate REAL,
  hrv_rmssd_milli REAL,
  spo2_percentage REAL,
  skin_temp_celsius REAL,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (cycle_id) REFERENCES recovery_records(cycle_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Workout parent records.
CREATE TABLE IF NOT EXISTS workout_records (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  created_at TEXT,
  updated_at TEXT,
  start_time TEXT,
  end_time TEXT,
  timezone_offset TEXT,
  sport_id INTEGER,
  sport_name TEXT,
  score_state TEXT,
  local_date TEXT,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Workout score fields.
CREATE TABLE IF NOT EXISTS workout_score (
  workout_id TEXT PRIMARY KEY,
  strain REAL,
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  kilojoule REAL,
  percent_recorded REAL,
  distance_meter REAL,
  altitude_gain_meter REAL,
  altitude_change_meter REAL,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (workout_id) REFERENCES workout_records(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Workout zone duration fields.
CREATE TABLE IF NOT EXISTS workout_zone_duration (
  workout_id TEXT PRIMARY KEY,
  zone_zero_milli INTEGER,
  zone_one_milli INTEGER,
  zone_two_milli INTEGER,
  zone_three_milli INTEGER,
  zone_four_milli INTEGER,
  zone_five_milli INTEGER,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (workout_id) REFERENCES workout_records(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Cycle parent records.
CREATE TABLE IF NOT EXISTS cycle_records (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  created_at TEXT,
  updated_at TEXT,
  start_time TEXT,
  end_time TEXT,
  timezone_offset TEXT,
  score_state TEXT,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Cycle score fields.
CREATE TABLE IF NOT EXISTS cycle_score (
  cycle_id INTEGER PRIMARY KEY,
  strain REAL,
  kilojoule REAL,
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  run_id INTEGER NOT NULL,
  FOREIGN KEY (cycle_id) REFERENCES cycle_records(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES dump_runs(id)
);

-- Run-oriented indexes for frequent inspection queries.
CREATE INDEX IF NOT EXISTS idx_sleep_records_run_id ON sleep_records(run_id);
CREATE INDEX IF NOT EXISTS idx_recovery_records_run_id ON recovery_records(run_id);
CREATE INDEX IF NOT EXISTS idx_workout_records_run_id ON workout_records(run_id);
CREATE INDEX IF NOT EXISTS idx_cycle_records_run_id ON cycle_records(run_id);
CREATE INDEX IF NOT EXISTS idx_sleep_records_local_date ON sleep_records(local_date);
CREATE INDEX IF NOT EXISTS idx_recovery_records_local_date ON recovery_records(local_date);
CREATE INDEX IF NOT EXISTS idx_workout_records_local_date ON workout_records(local_date);
