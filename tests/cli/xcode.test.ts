import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import type * as NodeOs from "node:os";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { execSyncMock, spawnMock, mockedState } = vi.hoisted(() => ({
  execSyncMock: vi.fn<(command: string) => string>(),
  spawnMock: vi.fn(),
  mockedState: { home: "" },
}));

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
  spawn: spawnMock,
}));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof NodeOs>("node:os");
  return {
    ...actual,
    homedir: () => mockedState.home,
    platform: () => "darwin",
  };
});

import { setupXcode, verifyXcode } from "../../src/cli/xcode-setup.js";
import { xcodeExtensionStatus } from "../../src/cli/xcode-extension.js";

describe("xcode CLI smoke coverage", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "axint-xcode-test-"));
    mockedState.home = join(tempRoot, "home");
    mkdirSync(mockedState.home, { recursive: true });
    execSyncMock.mockReset();
    spawnMock.mockReset();
    logSpy.mockClear();
    writeSpy.mockClear();
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("covers xcode setup for the hosted Codex MCP path", async () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.startsWith("xcodebuild -version")) {
        return "Xcode 26.3\nBuild version 17E123";
      }
      if (command.startsWith("xcrun mcpbridge --help")) {
        return "";
      }
      if (command.startsWith("which axint")) {
        return "/usr/local/bin/axint\n";
      }
      if (command.startsWith("codex mcp add axint --transport http")) {
        return "";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await setupXcode({ agent: "codex", remote: true });

    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "codex mcp add axint --transport http https://mcp.axint.ai/mcp"
      ),
      expect.objectContaining({ stdio: "inherit", timeout: 10000 })
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Setup complete"));
  });

  it("covers xcode verify against a responding MCP server", async () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.includes("tools/list")) {
        return JSON.stringify({
          tools: [
            { name: "axint.feature" },
            { name: "axint.compile" },
            { name: "axint.validate" },
          ],
        });
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await verifyXcode();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("All checks passed."));
  });

  it("covers extension status when the app is installed", async () => {
    const appPath = join(
      mockedState.home,
      "Applications",
      "AxintForXcode.app",
      "Contents"
    );
    mkdirSync(appPath, { recursive: true });
    writeFileSync(join(appPath, "Info.plist"), "<plist />", "utf-8");

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
      };
      child.stdout = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from("1.2.3\n"));
        child.emit("close", 0);
      });
      return child;
    });

    await xcodeExtensionStatus();

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining("AxintForXcode.app is installed")
    );
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("(v1.2.3)"));
  });
});
