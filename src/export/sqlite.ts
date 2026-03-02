import fs from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";
import { AppError } from "../util/errors";
import type { Logger } from "../util/logger";
import type { CycleRecord, RecoveryRecord, SleepRecord, WhoopDump, WorkoutRecord } from "../whoop/types";

const SCHEMA_VERSION = 1;

export interface SqliteExportOptions {
  dbPath: string;
  mode: "dump" | "server";
  filter?: string;
  logger?: Logger;
}

let schemaSqlCache: string | null = null;

// Load and cache schema SQL once per process.
async function readSchemaSql(): Promise<string> {
  if (schemaSqlCache) {
    return schemaSqlCache;
  }
  const schemaFile = Bun.file(new URL("./schema.sql", import.meta.url));
  schemaSqlCache = await schemaFile.text();
  return schemaSqlCache;
}

// Apply pragmatic runtime defaults for a long-lived local SQLite DB.
function applyPragmas(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
}

function applySchema(db: Database, schemaSql: string): void {
  db.exec(schemaSql);
  db.query(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) ON CONFLICT(version) DO NOTHING",
  ).run(SCHEMA_VERSION, new Date().toISOString());
}

function nowIso(): string {
  return new Date().toISOString();
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function parseTimezoneOffsetMinutes(timezoneOffset: string | null | undefined): number | null {
  if (!timezoneOffset) {
    return null;
  }

  const match = timezoneOffset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3], 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return sign * (hours * 60 + minutes);
}

function toYmdUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

function datePrefix(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function toLocalDate(timestamp: string | null | undefined, timezoneOffset: string | null | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const offsetMinutes = parseTimezoneOffsetMinutes(timezoneOffset);
  if (offsetMinutes !== null) {
    const localized = new Date(parsed.getTime() + offsetMinutes * 60_000);
    return toYmdUtc(localized);
  }

  return datePrefix(timestamp) ?? toYmdUtc(parsed);
}

function firstLocalDate(
  timezoneOffset: string | null | undefined,
  ...timestamps: Array<string | null | undefined>
): string | null {
  for (const timestamp of timestamps) {
    const localDate = toLocalDate(timestamp, timezoneOffset);
    if (localDate) {
      return localDate;
    }
  }
  return null;
}

function resolveSleepLocalDate(record: SleepRecord): string | null {
  return firstLocalDate(
    record.timezone_offset,
    record.end,
    record.updated_at,
    record.created_at,
    record.start,
  );
}

function resolveWorkoutLocalDate(record: WorkoutRecord): string | null {
  return firstLocalDate(
    record.timezone_offset,
    record.start,
    record.end,
    record.created_at,
    record.updated_at,
  );
}

function resolveCycleLocalDate(record: CycleRecord): string | null {
  return firstLocalDate(
    record.timezone_offset,
    record.end,
    record.updated_at,
    record.created_at,
    record.start,
  );
}

function buildCycleLocalDateMap(dump: WhoopDump): Map<number, string> {
  const cycleLocalDateById = new Map<number, string>();
  for (const record of dump.cycle_collection.records) {
    const localDate = resolveCycleLocalDate(record);
    if (localDate) {
      cycleLocalDateById.set(record.id, localDate);
    }
  }
  return cycleLocalDateById;
}

function resolveRecoveryLocalDate(
  record: RecoveryRecord,
  sleepLocalDateById: Map<string, string>,
  cycleLocalDateById: Map<number, string>,
): string | null {
  if (record.sleep_id) {
    const sleepLocalDate = sleepLocalDateById.get(record.sleep_id);
    if (sleepLocalDate) {
      return sleepLocalDate;
    }
  }

  const cycleLocalDate = cycleLocalDateById.get(record.cycle_id);
  if (cycleLocalDate) {
    return cycleLocalDate;
  }

  return firstLocalDate(null, record.created_at, record.updated_at);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNullableBoolInt(value: unknown): number | null {
  return typeof value === "boolean" ? (value ? 1 : 0) : null;
}

function insertDumpRun(db: Database, mode: string, filter: string | undefined): number {
  const startedAt = nowIso();
  db.query(
    "INSERT INTO dump_runs (mode, filter, started_at, status) VALUES (?, ?, ?, ?)",
  ).run(mode, filter ?? null, startedAt, "running");

  const row = db.query("SELECT last_insert_rowid() AS id").get() as { id: number } | null;
  if (!row) {
    throw new AppError("Failed to create dump run metadata row.", "FATAL");
  }
  return row.id;
}

function markDumpRunSuccess(db: Database, runId: number): void {
  db.query(
    "UPDATE dump_runs SET status = ?, finished_at = ?, error = NULL WHERE id = ?",
  ).run("success", nowIso(), runId);
}

function markDumpRunFailed(db: Database, mode: string, filter: string | undefined, errorMessage: string): void {
  db.query(
    "INSERT INTO dump_runs (mode, filter, started_at, finished_at, status, error) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(mode, filter ?? null, nowIso(), nowIso(), "failed", errorMessage);
}

function upsertUserProfile(db: Database, runId: number, dump: WhoopDump): void {
  db.query(
    `INSERT INTO user_profile (user_id, email, first_name, last_name, run_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        run_id = excluded.run_id,
        updated_at = excluded.updated_at`,
  ).run(
    dump.user_data.user_id,
    toNullableString(dump.user_data.email),
    toNullableString(dump.user_data.first_name),
    toNullableString(dump.user_data.last_name),
    runId,
    nowIso(),
  );
}

function upsertUserMeasurements(db: Database, runId: number, dump: WhoopDump): void {
  db.query(
    `INSERT INTO user_measurements (user_id, height_meter, weight_kilogram, max_heart_rate, run_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        height_meter = excluded.height_meter,
        weight_kilogram = excluded.weight_kilogram,
        max_heart_rate = excluded.max_heart_rate,
        run_id = excluded.run_id,
        updated_at = excluded.updated_at`,
  ).run(
    dump.user_data.user_id,
    toNullableNumber(dump.user_measurements.height_meter),
    toNullableNumber(dump.user_measurements.weight_kilogram),
    toNullableNumber(dump.user_measurements.max_heart_rate),
    runId,
    nowIso(),
  );
}

function upsertSleep(db: Database, runId: number, dump: WhoopDump): Map<string, string> {
  const sleepLocalDateById = new Map<string, string>();
  const sleepRecordStmt = db.query(
    `INSERT INTO sleep_records (id, user_id, created_at, updated_at, start_time, end_time, timezone_offset, nap, score_state, local_date, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        timezone_offset = excluded.timezone_offset,
        nap = excluded.nap,
        score_state = excluded.score_state,
        local_date = excluded.local_date,
        run_id = excluded.run_id`,
  );

  const sleepScoreStmt = db.query(
    `INSERT INTO sleep_score (sleep_id, respiratory_rate, sleep_performance_percentage, sleep_consistency_percentage, sleep_efficiency_percentage, run_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(sleep_id) DO UPDATE SET
        respiratory_rate = excluded.respiratory_rate,
        sleep_performance_percentage = excluded.sleep_performance_percentage,
        sleep_consistency_percentage = excluded.sleep_consistency_percentage,
        sleep_efficiency_percentage = excluded.sleep_efficiency_percentage,
        run_id = excluded.run_id`,
  );

  const stageStmt = db.query(
    `INSERT INTO sleep_stage_summary (sleep_id, total_in_bed_time_milli, total_awake_time_milli, total_no_data_time_milli, total_light_sleep_time_milli, total_slow_wave_sleep_time_milli, total_rem_sleep_time_milli, sleep_cycle_count, disturbance_count, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sleep_id) DO UPDATE SET
        total_in_bed_time_milli = excluded.total_in_bed_time_milli,
        total_awake_time_milli = excluded.total_awake_time_milli,
        total_no_data_time_milli = excluded.total_no_data_time_milli,
        total_light_sleep_time_milli = excluded.total_light_sleep_time_milli,
        total_slow_wave_sleep_time_milli = excluded.total_slow_wave_sleep_time_milli,
        total_rem_sleep_time_milli = excluded.total_rem_sleep_time_milli,
        sleep_cycle_count = excluded.sleep_cycle_count,
        disturbance_count = excluded.disturbance_count,
        run_id = excluded.run_id`,
  );

  const neededStmt = db.query(
    `INSERT INTO sleep_needed (sleep_id, baseline_milli, need_from_sleep_debt_milli, need_from_recent_strain_milli, need_from_recent_nap_milli, run_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(sleep_id) DO UPDATE SET
        baseline_milli = excluded.baseline_milli,
        need_from_sleep_debt_milli = excluded.need_from_sleep_debt_milli,
        need_from_recent_strain_milli = excluded.need_from_recent_strain_milli,
        need_from_recent_nap_milli = excluded.need_from_recent_nap_milli,
        run_id = excluded.run_id`,
  );

  for (const record of dump.sleep_collection.records) {
    const localDate = resolveSleepLocalDate(record);
    if (localDate) {
      sleepLocalDateById.set(record.id, localDate);
    }

    sleepRecordStmt.run(
      record.id,
      record.user_id,
      toNullableString(record.created_at),
      toNullableString(record.updated_at),
      toNullableString(record.start),
      toNullableString(record.end),
      toNullableString(record.timezone_offset),
      toNullableBoolInt(record.nap),
      toNullableString(record.score_state),
      localDate,
      runId,
    );

    sleepScoreStmt.run(
      record.id,
      toNullableNumber(record.score?.respiratory_rate),
      toNullableNumber(record.score?.sleep_performance_percentage),
      toNullableNumber(record.score?.sleep_consistency_percentage),
      toNullableNumber(record.score?.sleep_efficiency_percentage),
      runId,
    );

    stageStmt.run(
      record.id,
      toNullableNumber(record.score?.stage_summary?.total_in_bed_time_milli),
      toNullableNumber(record.score?.stage_summary?.total_awake_time_milli),
      toNullableNumber(record.score?.stage_summary?.total_no_data_time_milli),
      toNullableNumber(record.score?.stage_summary?.total_light_sleep_time_milli),
      toNullableNumber(record.score?.stage_summary?.total_slow_wave_sleep_time_milli),
      toNullableNumber(record.score?.stage_summary?.total_rem_sleep_time_milli),
      toNullableNumber(record.score?.stage_summary?.sleep_cycle_count),
      toNullableNumber(record.score?.stage_summary?.disturbance_count),
      runId,
    );

    neededStmt.run(
      record.id,
      toNullableNumber(record.score?.sleep_needed?.baseline_milli),
      toNullableNumber(record.score?.sleep_needed?.need_from_sleep_debt_milli),
      toNullableNumber(record.score?.sleep_needed?.need_from_recent_strain_milli),
      toNullableNumber(record.score?.sleep_needed?.need_from_recent_nap_milli),
      runId,
    );
  }

  return sleepLocalDateById;
}

function upsertRecovery(
  db: Database,
  runId: number,
  dump: WhoopDump,
  sleepLocalDateById: Map<string, string>,
  cycleLocalDateById: Map<number, string>,
): void {
  const recordStmt = db.query(
    `INSERT INTO recovery_records (cycle_id, sleep_id, user_id, created_at, updated_at, score_state, local_date, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cycle_id) DO UPDATE SET
        sleep_id = excluded.sleep_id,
        user_id = excluded.user_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        score_state = excluded.score_state,
        local_date = excluded.local_date,
        run_id = excluded.run_id`,
  );

  const scoreStmt = db.query(
    `INSERT INTO recovery_score (cycle_id, user_calibrating, recovery_score, resting_heart_rate, hrv_rmssd_milli, spo2_percentage, skin_temp_celsius, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cycle_id) DO UPDATE SET
        user_calibrating = excluded.user_calibrating,
        recovery_score = excluded.recovery_score,
        resting_heart_rate = excluded.resting_heart_rate,
        hrv_rmssd_milli = excluded.hrv_rmssd_milli,
        spo2_percentage = excluded.spo2_percentage,
        skin_temp_celsius = excluded.skin_temp_celsius,
        run_id = excluded.run_id`,
  );

  for (const record of dump.recovery_collection.records) {
    const localDate = resolveRecoveryLocalDate(record, sleepLocalDateById, cycleLocalDateById);

    recordStmt.run(
      record.cycle_id,
      toNullableString(record.sleep_id),
      record.user_id,
      toNullableString(record.created_at),
      toNullableString(record.updated_at),
      toNullableString(record.score_state),
      localDate,
      runId,
    );

    scoreStmt.run(
      record.cycle_id,
      toNullableBoolInt(record.score?.user_calibrating),
      toNullableNumber(record.score?.recovery_score),
      toNullableNumber(record.score?.resting_heart_rate),
      toNullableNumber(record.score?.hrv_rmssd_milli),
      toNullableNumber(record.score?.spo2_percentage),
      toNullableNumber(record.score?.skin_temp_celsius),
      runId,
    );
  }
}

function upsertWorkout(db: Database, runId: number, dump: WhoopDump): void {
  const recordStmt = db.query(
    `INSERT INTO workout_records (id, user_id, created_at, updated_at, start_time, end_time, timezone_offset, sport_id, sport_name, score_state, local_date, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        timezone_offset = excluded.timezone_offset,
        sport_id = excluded.sport_id,
        sport_name = excluded.sport_name,
        score_state = excluded.score_state,
        local_date = excluded.local_date,
        run_id = excluded.run_id`,
  );

  const scoreStmt = db.query(
    `INSERT INTO workout_score (workout_id, strain, average_heart_rate, max_heart_rate, kilojoule, percent_recorded, distance_meter, altitude_gain_meter, altitude_change_meter, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workout_id) DO UPDATE SET
        strain = excluded.strain,
        average_heart_rate = excluded.average_heart_rate,
        max_heart_rate = excluded.max_heart_rate,
        kilojoule = excluded.kilojoule,
        percent_recorded = excluded.percent_recorded,
        distance_meter = excluded.distance_meter,
        altitude_gain_meter = excluded.altitude_gain_meter,
        altitude_change_meter = excluded.altitude_change_meter,
        run_id = excluded.run_id`,
  );

  const zoneStmt = db.query(
    `INSERT INTO workout_zone_duration (workout_id, zone_zero_milli, zone_one_milli, zone_two_milli, zone_three_milli, zone_four_milli, zone_five_milli, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workout_id) DO UPDATE SET
        zone_zero_milli = excluded.zone_zero_milli,
        zone_one_milli = excluded.zone_one_milli,
        zone_two_milli = excluded.zone_two_milli,
        zone_three_milli = excluded.zone_three_milli,
        zone_four_milli = excluded.zone_four_milli,
        zone_five_milli = excluded.zone_five_milli,
        run_id = excluded.run_id`,
  );

  for (const record of dump.workout_collection.records) {
    const localDate = resolveWorkoutLocalDate(record);

    recordStmt.run(
      record.id,
      record.user_id,
      toNullableString(record.created_at),
      toNullableString(record.updated_at),
      toNullableString(record.start),
      toNullableString(record.end),
      toNullableString(record.timezone_offset),
      record.sport_id ?? null,
      toNullableString(record.sport_name),
      toNullableString(record.score_state),
      localDate,
      runId,
    );

    scoreStmt.run(
      record.id,
      toNullableNumber(record.score?.strain),
      toNullableNumber(record.score?.average_heart_rate),
      toNullableNumber(record.score?.max_heart_rate),
      toNullableNumber(record.score?.kilojoule),
      toNullableNumber(record.score?.percent_recorded),
      toNullableNumber(record.score?.distance_meter),
      toNullableNumber(record.score?.altitude_gain_meter),
      toNullableNumber(record.score?.altitude_change_meter),
      runId,
    );

    zoneStmt.run(
      record.id,
      toNullableNumber(record.score?.zone_duration?.zone_zero_milli),
      toNullableNumber(record.score?.zone_duration?.zone_one_milli),
      toNullableNumber(record.score?.zone_duration?.zone_two_milli),
      toNullableNumber(record.score?.zone_duration?.zone_three_milli),
      toNullableNumber(record.score?.zone_duration?.zone_four_milli),
      toNullableNumber(record.score?.zone_duration?.zone_five_milli),
      runId,
    );
  }
}

function upsertCycle(db: Database, runId: number, dump: WhoopDump): void {
  const recordStmt = db.query(
    `INSERT INTO cycle_records (id, user_id, created_at, updated_at, start_time, end_time, timezone_offset, score_state, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        timezone_offset = excluded.timezone_offset,
        score_state = excluded.score_state,
        run_id = excluded.run_id`,
  );

  const scoreStmt = db.query(
    `INSERT INTO cycle_score (cycle_id, strain, kilojoule, average_heart_rate, max_heart_rate, run_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(cycle_id) DO UPDATE SET
        strain = excluded.strain,
        kilojoule = excluded.kilojoule,
        average_heart_rate = excluded.average_heart_rate,
        max_heart_rate = excluded.max_heart_rate,
        run_id = excluded.run_id`,
  );

  for (const record of dump.cycle_collection.records) {
    recordStmt.run(
      record.id,
      record.user_id,
      toNullableString(record.created_at),
      toNullableString(record.updated_at),
      toNullableString(record.start),
      toNullableString(record.end),
      toNullableString(record.timezone_offset),
      toNullableString(record.score_state),
      runId,
    );

    scoreStmt.run(
      record.id,
      toNullableNumber(record.score?.strain),
      toNullableNumber(record.score?.kilojoule),
      toNullableNumber(record.score?.average_heart_rate),
      toNullableNumber(record.score?.max_heart_rate),
      runId,
    );
  }
}

/**
 * Export a fully collected Whoop dump into the normalized SQLite schema.
 *
 * Guarantees:
 * - WAL mode and schema setup are applied before writes.
 * - domain writes happen in one transaction.
 * - run status is tracked in dump_runs.
 */
export async function exportToSqlite(dump: WhoopDump, options: SqliteExportOptions): Promise<void> {
  await fs.mkdir(path.dirname(options.dbPath), { recursive: true });
  const schemaSql = await readSchemaSql();

  const db = new Database(options.dbPath, { create: true, strict: true });

  try {
    applyPragmas(db);
    applySchema(db, schemaSql);

    db.exec("BEGIN IMMEDIATE");
    const runId = insertDumpRun(db, options.mode, options.filter);
    const cycleLocalDateById = buildCycleLocalDateMap(dump);

    upsertUserProfile(db, runId, dump);
    upsertUserMeasurements(db, runId, dump);
    const sleepLocalDateById = upsertSleep(db, runId, dump);
    upsertRecovery(db, runId, dump, sleepLocalDateById, cycleLocalDateById);
    upsertWorkout(db, runId, dump);
    upsertCycle(db, runId, dump);

    markDumpRunSuccess(db, runId);

    db.exec("COMMIT");
    options.logger?.info("SQLite export complete", { dbPath: options.dbPath, runId });
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Best effort rollback.
    }

    try {
      const errorMessage = error instanceof Error ? error.message : String(error);
      markDumpRunFailed(db, options.mode, options.filter, errorMessage);
    } catch {
      // best effort failure tracking
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new AppError(`SQLite export failed: ${errorMessage}`, "FATAL", { cause: error });
  } finally {
    db.close(false);
  }
}
