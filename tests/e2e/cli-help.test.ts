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
    expect(output).toContain("sync");
    expect(output).not.toContain("dump    Fetch Whoop data once and export it");
  });

  it("prints login help with manual option", async () => {
    const cwd = fileURLToPath(new URL("../../", import.meta.url));
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "login", "--help"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(output).toContain("Usage: whoosh login");
    expect(output).toContain("--manual");
  });

  it("prints sync help", async () => {
    const cwd = fileURLToPath(new URL("../../", import.meta.url));
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "sync", "--help"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(output).toContain("Usage: whoosh sync");
    expect(output).toContain("overrides incremental default");
  });

  it("prints server help with health endpoint option", async () => {
    const cwd = fileURLToPath(new URL("../../", import.meta.url));
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "server", "--help"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const code = await proc.exited;

    expect(code).toBe(0);
    expect(output).toContain("Usage: whoosh server");
    expect(output).toContain("--health-port");
    expect(output).toContain("/health");
  });
});
