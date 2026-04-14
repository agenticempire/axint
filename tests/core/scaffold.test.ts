import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldProject } from "../../src/cli/scaffold.js";

describe("scaffoldProject", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "axint-scaffold-test-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("writes a complete project skeleton", async () => {
    const result = await scaffoldProject({
      targetDir: workDir,
      projectName: "my-intents",
      template: "create-event",
      version: "0.3.0",
      install: false,
    });

    expect(result.files).toContain("package.json");
    expect(result.files).toContain("tsconfig.json");
    expect(result.files).toContain(".gitignore");
    expect(result.files).toContain("README.md");
    expect(
      result.files.some((f) => f.includes("intents") && f.endsWith("create-event.ts"))
    ).toBe(true);
    expect(result.files.some((f) => f.includes("mcp.json"))).toBe(true);
    expect(result.entryFile).toBe("create-event.ts");
  });

  it("pins the generated package.json to the current compiler version", async () => {
    await scaffoldProject({
      targetDir: workDir,
      projectName: "versioned-app",
      template: "send-message",
      version: "0.3.0",
      install: false,
    });

    const pkg = JSON.parse(await readFile(join(workDir, "package.json"), "utf-8"));
    expect(pkg.name).toBe("versioned-app");
    expect(pkg.type).toBe("module");
    expect(pkg.dependencies["@axint/compiler"]).toBe("^0.3.0");
    expect(pkg.scripts.compile).toContain("axint compile");
    expect(pkg.scripts.validate).toContain("axint validate");
    expect(pkg.scripts.sandbox).toContain("--sandbox");
  });

  it("rewrites the template import to @axint/compiler/sdk", async () => {
    await scaffoldProject({
      targetDir: workDir,
      projectName: "import-rewrite-test",
      template: "create-event",
      version: "0.3.0",
      install: false,
    });

    const intentSource = await readFile(
      join(workDir, "intents", "create-event.ts"),
      "utf-8"
    );
    expect(intentSource).toContain('from "@axint/compiler"');
    expect(intentSource).not.toContain('from "axint"');
  });

  it("writes a pre-wired MCP config for Cursor/Claude Code/Windsurf", async () => {
    await scaffoldProject({
      targetDir: workDir,
      projectName: "mcp-ready",
      template: "create-event",
      version: "0.3.0",
      install: false,
    });

    const mcp = JSON.parse(await readFile(join(workDir, ".vscode", "mcp.json"), "utf-8"));
    expect(mcp.mcpServers.axint.command).toBe("npx");
    expect(mcp.mcpServers.axint.args).toContain("-y");
    expect(mcp.mcpServers.axint.args).toContain("@axint/compiler");
    expect(mcp.mcpServers.axint.args).toContain("axint-mcp");
  });

  it("creates the ios/Intents output target directory", async () => {
    await scaffoldProject({
      targetDir: workDir,
      projectName: "target-dir",
      template: "create-event",
      version: "0.3.0",
      install: false,
    });
    expect(existsSync(join(workDir, "ios", "Intents"))).toBe(true);
  });

  it("throws on an unknown template", async () => {
    await expect(
      scaffoldProject({
        targetDir: workDir,
        projectName: "bad-template",
        template: "does-not-exist-xyz",
        version: "0.3.0",
        install: false,
      })
    ).rejects.toThrow(/Unknown template/);
  });

  it("refuses to overwrite a populated directory", async () => {
    await writeFile(join(workDir, "existing-file.txt"), "don't touch me");
    await expect(
      scaffoldProject({
        targetDir: workDir,
        projectName: "populated",
        template: "create-event",
        version: "0.3.0",
        install: false,
      })
    ).rejects.toThrow(/not empty/);
  });

  it("tolerates a .git folder in the target directory", async () => {
    await mkdir(join(workDir, ".git"), { recursive: true });
    await writeFile(join(workDir, ".git", "HEAD"), "ref: refs/heads/main");

    const result = await scaffoldProject({
      targetDir: workDir,
      projectName: "git-ok",
      template: "create-event",
      version: "0.3.0",
      install: false,
    });
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("writes a project README naming the scaffolded template", async () => {
    await scaffoldProject({
      targetDir: workDir,
      projectName: "readme-check",
      template: "book-ride",
      version: "0.3.0",
      install: false,
    });

    const readme = await readFile(join(workDir, "README.md"), "utf-8");
    expect(readme).toContain("# readme-check");
    expect(readme).toContain("book-ride");
    expect(readme).toContain("axint.ai");
    expect(readme).toContain("@axint/compiler@^0.3.0");
  });
});
