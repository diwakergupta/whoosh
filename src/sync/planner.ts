import { getLastSuccessfulSyncBoundary } from "../export/sqlite";
import { buildFilter } from "../util/time";

export interface SyncWindowPlan {
  mode: "full" | "incremental" | "custom";
  filter?: string;
  start?: string;
  end?: string;
}

export interface PlanSyncWindowOptions {
  output: "sqlite" | "json";
  dbPath?: string;
  filter?: string;
  now?: Date;
}

export async function planSyncWindow(options: PlanSyncWindowOptions): Promise<SyncWindowPlan> {
  if (options.filter) {
    return {
      mode: "custom",
      filter: options.filter,
    };
  }

  if (options.output !== "sqlite" || !options.dbPath) {
    return { mode: "full" };
  }

  const start = await getLastSuccessfulSyncBoundary(options.dbPath);
  if (!start) {
    return { mode: "full" };
  }

  const end = (options.now ?? new Date()).toISOString();
  return {
    mode: "incremental",
    filter: buildFilter(start, end),
    start,
    end,
  };
}
