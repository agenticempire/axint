import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const CLI = resolve(__dirname, "../../dist/cli/index.js");

const VALID_INTENT = `
import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "Greet",
  title: "Greet Someone",
  description: "Says hello",
  domain: "general",
  params: {
    name: param.string("Who to greet"),
  },
  perform({ name }) {
    return "Hello " + name;
  },
});
`;

const UPDATED_INTENT = `
import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "GreetUpdated",
  title: "Greet Someone Updated",
  description: "Says hello (v2)",
  domain: "general",
  params: {
    name: param.string("Who to greet"),
  },
  perform({ name }) {
    return "Hi " + name;
  },
});
`;

/**
 * Collects all stdout+stderr from a child process into a shared buffer.
 * `waitFor(match)` resolves when the match appears in the *total* output.
 */
function outputCollector(proc: ChildProcess) {
  let buffer = "";
  const listeners: Array<() => void> = [];

  function notify() {
    for (const fn of listeners) fn();
  }

  proc.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    notify();
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    notify();
  });

  return {
    waitFor(match: string | RegExp, timeoutMs = 10_000): Promise<string> {
      return new Promise((resolve, reject) => {
        const check = () => {
          const found =
            typeof match === "string" ? buffer.includes(match) : match.test(buffer);
          if (found) {
            clearTimeout(timer);
            const idx = listeners.indexOf(check);
            if (idx >= 0) listeners.splice(idx, 1);
            resolve(buffer);
          }
        };

        const timer = setTimeout(() => {
          const idx = listeners.indexOf(check);
          if (idx >= 0) listeners.splice(idx, 1);
          reject(new Error(`Timed out waiting for ${match}. Got:\n${buffer}`));
        }, timeoutMs);

        listeners.push(check);
        check(); // in case it's already there
      });
    },
    getBuffer: () => buffer,
  };
}

// fs.watch is unreliable on Linux (GitHub Actions Ubuntu runners drop events),
// so these integration tests only run locally where native FSEvents / inotify work.
const isCI = !!process.env.CI;

describe.skipIf(isCI)("axint watch", () => {
  let tmpDir: string;
  let proc: ChildProcess | null = null;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `axint-watch-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (proc && !proc.killed) {
      proc.kill("SIGINT");
      proc = null;
    }
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("compiles on startup and recompiles on file change", async () => {
    const intentFile = join(tmpDir, "greet.ts");
    const outDir = join(tmpDir, "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(intentFile, VALID_INTENT, "utf-8");

    proc = spawn("node", [CLI, "watch", intentFile, "-o", outDir], {
      cwd: tmpDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out = outputCollector(proc);

    // Wait for initial compile
    await out.waitFor("watching for changes");

    // Verify output file exists
    const outFile = join(outDir, "GreetIntent.swift");
    expect(existsSync(outFile)).toBe(true);
    const initial = readFileSync(outFile, "utf-8");
    expect(initial).toContain("Greet");

    // Small delay to let the watcher fully settle before triggering a change
    await new Promise((r) => setTimeout(r, 500));

    // Trigger a recompile by editing the file
    writeFileSync(intentFile, UPDATED_INTENT, "utf-8");

    // Wait for recompile (same collector, shared buffer)
    await out.waitFor("GreetUpdated", 12_000);

    // Verify the new output file was written
    const updatedFile = join(outDir, "GreetUpdatedIntent.swift");
    expect(existsSync(updatedFile)).toBe(true);
    const updated = readFileSync(updatedFile, "utf-8");
    expect(updated).toContain("GreetUpdated");
  }, 15_000);

  it("reports errors without crashing the watcher", async () => {
    const intentFile = join(tmpDir, "bad.ts");
    const outDir = join(tmpDir, "out");
    mkdirSync(outDir, { recursive: true });

    // Start with a broken intent
    writeFileSync(intentFile, "export default { broken: true };", "utf-8");

    proc = spawn("node", [CLI, "watch", intentFile, "-o", outDir], {
      cwd: tmpDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out = outputCollector(proc);

    // Should still reach the watching state even with compile errors
    await out.waitFor("watching for changes");

    // Let the watcher fully settle before triggering a change
    await new Promise((r) => setTimeout(r, 500));

    // Fix the file
    writeFileSync(intentFile, VALID_INTENT, "utf-8");

    // Should recover and compile successfully
    await out.waitFor("GreetIntent.swift");
  }, 15_000);

  it("watches a directory of intents", async () => {
    const outDir = join(tmpDir, "out");
    const srcDir = join(tmpDir, "intents");
    mkdirSync(outDir, { recursive: true });
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(join(srcDir, "greet.ts"), VALID_INTENT, "utf-8");

    proc = spawn("node", [CLI, "watch", srcDir, "-o", outDir], {
      cwd: tmpDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out = outputCollector(proc);
    await out.waitFor("watching for changes");
    expect(existsSync(join(outDir, "GreetIntent.swift"))).toBe(true);
  }, 15_000);
});
