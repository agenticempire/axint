import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProjectContextHint,
  buildProjectContextIndex,
  writeProjectContextIndex,
} from "../../src/project/context-index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "axint-context-"));
  tempDirs.push(dir);
  return dir;
}

describe("project context index", () => {
  it("indexes SwiftUI interaction risk and writes local artifacts", () => {
    const dir = tempProject();
    mkdirSync(join(dir, "Swarm.xcodeproj", "xcshareddata", "xcschemes"), {
      recursive: true,
    });
    writeFileSync(
      join(dir, "Swarm.xcodeproj", "xcshareddata", "xcschemes", "Swarm.xcscheme"),
      "<Scheme></Scheme>\n"
    );
    writeFileSync(
      join(dir, "HomeView.swift"),
      [
        "import SwiftUI",
        "",
        "struct HomeView: View {",
        '    @State private var draft = ""',
        "    var body: some View {",
        "        TextEditor(text: $draft)",
        "            .overlay {",
        '                Text("Comment")',
        "            }",
        "    }",
        "}",
        "",
      ].join("\n")
    );
    writeFileSync(
      join(dir, "FeedOverlay.swift"),
      [
        "import SwiftUI",
        "",
        "struct FeedOverlay: View {",
        "    var body: some View {",
        "        Color.clear",
        "            .highPriorityGesture(DragGesture())",
        "    }",
        "}",
        "",
      ].join("\n")
    );

    const result = writeProjectContextIndex({
      targetDir: dir,
      projectName: "Swarm",
      changedFiles: ["FeedOverlay.swift"],
    });

    expect(result.index.projectName).toBe("Swarm");
    expect(result.index.xcode.schemes).toContain("Swarm");
    expect(result.index.files.swift).toBe(2);
    expect(result.index.git.changedFiles).toContain("FeedOverlay.swift");
    expect(result.index.topInteractionRiskFiles.map((file) => file.path)).toContain(
      "HomeView.swift"
    );
    expect(readFileSync(result.jsonPath, "utf-8")).toContain('"projectName": "Swarm"');
    expect(readFileSync(result.markdownPath, "utf-8")).toContain(
      "## Interaction Risk Files"
    );
  });

  it("builds related-file hints for input interaction failures", () => {
    const dir = tempProject();
    writeFileSync(
      join(dir, "HomeComposer.swift"),
      [
        "import SwiftUI",
        "",
        "struct HomeComposer: View {",
        '    @State private var draft = ""',
        "    var body: some View {",
        "        TextEditor(text: $draft)",
        "    }",
        "}",
        "",
      ].join("\n")
    );
    writeFileSync(
      join(dir, "FeedScreen.swift"),
      [
        "import SwiftUI",
        "",
        "struct FeedScreen: View {",
        "    @State private var gate = false",
        "    var body: some View {",
        "        HomeComposer()",
        "            .disabled(gate)",
        "    }",
        "}",
        "",
      ].join("\n")
    );

    const index = buildProjectContextIndex({
      targetDir: dir,
      changedFiles: ["FeedScreen.swift"],
    });
    const hint = buildProjectContextHint({
      sourcePath: join(dir, "HomeComposer.swift"),
      projectContext: index,
      focus: "interactive-input",
    });

    expect(hint?.relatedFiles.map((file) => file.path)).toContain("FeedScreen.swift");
    expect(hint?.summary.join("\n")).toContain("Changed files: FeedScreen.swift");
  });
});
