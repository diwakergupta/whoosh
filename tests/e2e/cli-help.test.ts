import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

describe("CLI help", () => {
  it("prints root help", async () => {
    const cwd = fileURLToPath(new URL("../../", import.meta.url));
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "--help"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(output).toContain("whoosh");
    expect(output).toContain("Commands:");
  });
});
