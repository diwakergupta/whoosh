import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exportToSqlite } from "../../src/export/sqlite";
import { createSampleDump } from "../fixtures/sample-dump";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "whoosh-sqlite-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("exportToSqlite", () => {
  it("creates normalized tables and upserts records", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "whoosh.sqlite");

    const dump = createSampleDump();
    await exportToSqlite(dump, {
      dbPath,
      mode: "dump",
      filter: "start=2026-01-01T00:00:00.000Z",
    });

    dump.user_data.first_name = "Updated";
    await exportToSqlite(dump, {
      dbPath,
      mode: "dump",
    });

    const db = new Database(dbPath, { readonly: true });
    try {
      const profile = db.query("SELECT first_name FROM user_profile WHERE user_id = 42").get() as { first_name: string };
      expect(profile.first_name).toBe("Updated");

      const sleepCount = db.query("SELECT COUNT(*) AS count FROM sleep_records").get() as { count: number };
      expect(sleepCount.count).toBe(1);

      const sleepLocalDate = db.query("SELECT local_date FROM sleep_records WHERE id = 'sleep-1'").get() as {
        local_date: string | null;
      };
      expect(sleepLocalDate.local_date).toBe("2026-01-01");

      const recoveryLocalDate = db
        .query("SELECT local_date FROM recovery_records WHERE cycle_id = 100")
        .get() as { local_date: string | null };
      expect(recoveryLocalDate.local_date).toBe("2026-01-01");

      const workoutLocalDate = db
        .query("SELECT local_date FROM workout_records WHERE id = 'workout-1'")
        .get() as { local_date: string | null };
      expect(workoutLocalDate.local_date).toBe("2026-01-01");

      const runs = db.query("SELECT COUNT(*) AS count FROM dump_runs").get() as { count: number };
      expect(runs.count).toBe(2);

      const sleepIndexes = db.query("PRAGMA index_list('sleep_records')").all() as Array<{ name: string }>;
      const hasSleepLocalDateIndex = sleepIndexes.some((row) => row.name === "idx_sleep_records_local_date");
      expect(hasSleepLocalDateIndex).toBe(true);

      const mode = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
      expect(mode.journal_mode.toLowerCase()).toBe("wal");
    } finally {
      db.close(false);
    }
  });

  it("uses wake-day semantics for sleep/recovery and local timezone for workouts", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "whoosh.sqlite");

    const dump = createSampleDump();
    dump.sleep_collection.records[0].end = "2026-03-10T03:30:00.000Z";
    dump.sleep_collection.records[0].updated_at = "2026-03-10T03:35:00.000Z";
    dump.sleep_collection.records[0].timezone_offset = "-04:00";
    dump.recovery_collection.records[0].created_at = "2026-03-10T12:00:00.000Z";
    dump.workout_collection.records[0].start = "2026-03-10T02:15:00.000Z";
    dump.workout_collection.records[0].timezone_offset = "-04:00";

    await exportToSqlite(dump, {
      dbPath,
      mode: "dump",
    });

    const db = new Database(dbPath, { readonly: true });
    try {
      const sleepLocalDate = db.query("SELECT local_date FROM sleep_records WHERE id = 'sleep-1'").get() as {
        local_date: string | null;
      };
      expect(sleepLocalDate.local_date).toBe("2026-03-09");

      const recoveryLocalDate = db
        .query("SELECT local_date FROM recovery_records WHERE cycle_id = 100")
        .get() as { local_date: string | null };
      expect(recoveryLocalDate.local_date).toBe("2026-03-09");

      const workoutLocalDate = db
        .query("SELECT local_date FROM workout_records WHERE id = 'workout-1'")
        .get() as { local_date: string | null };
      expect(workoutLocalDate.local_date).toBe("2026-03-09");
    } finally {
      db.close(false);
    }
  });

  it("handles records with missing score objects", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "whoosh.sqlite");

    const dump = createSampleDump();
    dump.sleep_collection.records[0].score = null;
    dump.recovery_collection.records[0].score = null;
    dump.workout_collection.records[0].score = null;
    dump.cycle_collection.records[0].score = null;

    await exportToSqlite(dump, {
      dbPath,
      mode: "dump",
    });

    const db = new Database(dbPath, { readonly: true });
    try {
      const sleepScore = db
        .query("SELECT respiratory_rate FROM sleep_score WHERE sleep_id = 'sleep-1'")
        .get() as { respiratory_rate: number | null };
      expect(sleepScore.respiratory_rate).toBeNull();
    } finally {
      db.close(false);
    }
  });
});
