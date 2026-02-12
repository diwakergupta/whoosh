import os from "node:os";
import path from "node:path";

export function expandHomePath(value: string, homeDir: string = os.homedir()): string {
  if (!value.startsWith("~")) {
    return value;
  }
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/")) {
    return path.join(homeDir, value.slice(2));
  }
  return value;
}

export function toAbsolutePath(value: string, baseDir: string): string {
  const expanded = expandHomePath(value);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(baseDir, expanded);
}
