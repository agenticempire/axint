import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { EventEmitter } from "node:events";
import { basename, join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const harness = vi.hoisted(() => {
  const watchers: Array<{
    path: string;
    callback: (eventType: string, filename: string | Buffer | null) => void;
    emitter: EventEmitter;
  }> = [];

  const compileFile = vi.fn();
  const emitFixPacketArtifacts = vi.fn();
  const spawn = vi.fn(() => {
    const proc = new EventEmitter() as EventEmitter & {
      on: EventEmitter["on"];
    };
    queueMicrotask(() => proc.emit("close", 0));
    return proc as unknown as {
      on: EventEmitter["on"];
    };
  });
  const fsWatch = vi.fn(
    (
      path: string,
      _options: { persistent: boolean },
      callback: (eventType: string, filename: string | Buffer | null) => void
    ) => {
      const emitter = new EventEmitter();
      watchers.push({ path, callback, emitter });
      return emitter as unknown as EventEmitter;
    }
  );

  return {
    watchers,
    compileFile,
    emitFixPacketArtifacts,
    spawn,
    fsWatch,
  };
});

vi.mock("node:child_process", () => ({
  spawn: harness.spawn,
}));

vi.mock("../../src/core/compiler.js", () => ({
  compileFile: harness.compileFile,
}));

vi.mock("../../src/repair/fix-packet.js", () => ({
  emitFixPacketArtifacts: harness.emitFixPacketArtifacts,
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    watch: harness.fsWatch,
  };
});

import { registerWatch } from "../../src/cli/watch.js";

async function run(program: Command, args: string[]) {
  program.name("axint");
  await program.parseAsync(["node", "axint", ...args], { from: "node" });
}

describe("watch command unit coverage", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
  let tempRoot = "";

  beforeEach(() => {
    vi.useFakeTimers();
    tempRoot = mkdtempSync(join(tmpdir(), "axint-watch-unit-"));
    harness.watchers.length = 0;
    harness.compileFile.mockReset();
    harness.emitFixPacketArtifacts.mockReset();
    harness.spawn.mockClear();
    harness.fsWatch.mockClear();
    logSpy.mockClear();
    errorSpy.mockClear();
    processOnSpy.mockClear();
    harness.emitFixPacketArtifacts.mockReturnValue({
      jsonPath: join(tempRoot, ".axint", "fix", "latest.json"),
      markdownPath: join(tempRoot, ".axint", "fix", "latest.md"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("covers single-file watch recompiles and swift-build follow-up", async () => {
    const intentFile = join(tempRoot, "greet.ts");
    const outDir = join(tempRoot, "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(intentFile, "export default {}", "utf-8");

    harness.compileFile.mockImplementation(
      (filePath: string, options: { outDir: string }) => ({
        success: true,
        diagnostics: [],
        output: {
          ir: {
            name: basename(filePath).includes("updated") ? "GreetUpdated" : "Greet",
          },
          outputPath: join(options.outDir, "GreetIntent.swift"),
          swiftCode: `// compiled from ${basename(filePath)}`,
        },
      })
    );

    const program = new Command();
    registerWatch(program);
    await run(program, ["watch", intentFile, "-o", outDir, "--swift-build"]);

    expect(harness.compileFile).toHaveBeenCalledTimes(1);
    expect(harness.spawn).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(outDir, "GreetIntent.swift"), "utf-8")).toContain(
      "compiled from greet.ts"
    );
    expect(harness.watchers).toHaveLength(1);

    const watcher = harness.watchers[0];
    watcher.callback("change", basename(intentFile));
    await vi.advanceTimersByTimeAsync(200);

    expect(harness.compileFile).toHaveBeenCalledTimes(2);
    expect(harness.spawn).toHaveBeenCalledTimes(2);
    expect(harness.fsWatch).toHaveBeenCalledWith(
      tempRoot,
      { persistent: true },
      expect.any(Function)
    );
  });

  it("covers directory watch filtering and ignores .d.ts updates", async () => {
    const srcDir = join(tempRoot, "intents");
    const outDir = join(tempRoot, "out");
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(srcDir, "first.ts"), "export default {}", "utf-8");
    writeFileSync(join(srcDir, "types.d.ts"), "export type Demo = string;", "utf-8");
    writeFileSync(join(srcDir, "notes.txt"), "ignore", "utf-8");

    harness.compileFile.mockImplementation(
      (filePath: string, options: { outDir: string }) => ({
        success: true,
        diagnostics: [],
        output: {
          ir: { name: basename(filePath, ".ts") },
          outputPath: join(options.outDir, `${basename(filePath, ".ts")}.swift`),
          swiftCode: `// compiled from ${basename(filePath)}`,
        },
      })
    );

    const program = new Command();
    registerWatch(program);
    await run(program, ["watch", srcDir, "-o", outDir]);

    expect(harness.compileFile).toHaveBeenCalledTimes(1);
    expect(harness.compileFile).toHaveBeenCalledWith(
      join(srcDir, "first.ts"),
      expect.objectContaining({ outDir })
    );
    expect(harness.watchers).toHaveLength(1);

    const watcher = harness.watchers[0];
    watcher.callback("change", "types.d.ts");
    await vi.advanceTimersByTimeAsync(200);
    expect(harness.compileFile).toHaveBeenCalledTimes(1);

    watcher.callback("change", "first.ts");
    await vi.advanceTimersByTimeAsync(200);
    expect(harness.compileFile).toHaveBeenCalledTimes(2);
    expect(readFileSync(join(outDir, "first.swift"), "utf-8")).toContain(
      "compiled from first.ts"
    );
  });
});
