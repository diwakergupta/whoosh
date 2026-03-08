import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exportToSqlite } from "../../src/export/sqlite";
import { planSyncWindow } from "../../src/sync/planner";
import { createSampleDump } from "../fixtures/sample-dump";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "whoosh-sync-plan-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("planSyncWindow", () => {
  it("returns a full sync when no prior sqlite state exists", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "whoosh.sqlite");

    const plan = await planSyncWindow({
      output: "sqlite",
      dbPath,
      now: new Date("2026-03-08T12:00:00.000Z"),
    });

    expect(plan).toEqual({ mode: "full" });
  });

  it("returns an incremental window from the last successful sqlite sync", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "whoosh.sqlite");

    await exportToSqlite(createSampleDump(), {
      dbPath,
      mode: "server",
      filter: "start=2026-03-01T00:00:00.000Z&end=2026-03-02T00:00:00.000Z",
    });

    const plan = await planSyncWindow({
      output: "sqlite",
      dbPath,
      now: new Date("2026-03-08T12:00:00.000Z"),
    });

    expect(plan).toEqual({
      mode: "incremental",
      filter: "start=2026-03-02T00%3A00%3A00.000Z&end=2026-03-08T12%3A00%3A00.000Z",
      start: "2026-03-02T00:00:00.000Z",
      end: "2026-03-08T12:00:00.000Z",
    });
  });

  it("preserves an explicit filter", async () => {
    const plan = await planSyncWindow({
      output: "sqlite",
      dbPath: "/tmp/unused.sqlite",
      filter: "start=2026-03-04T00:00:00.000Z&end=2026-03-05T00:00:00.000Z",
    });

    expect(plan).toEqual({
      mode: "custom",
      filter: "start=2026-03-04T00:00:00.000Z&end=2026-03-05T00:00:00.000Z",
    });
  });
});
