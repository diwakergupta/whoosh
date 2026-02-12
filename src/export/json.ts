import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../util/logger";
import type { WhoopDump } from "../whoop/types";

export async function exportToJson(dump: WhoopDump, jsonPath: string, logger?: Logger): Promise<void> {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(dump, null, 2)}\n`, "utf8");
  logger?.info("JSON export complete", { jsonPath });
}
