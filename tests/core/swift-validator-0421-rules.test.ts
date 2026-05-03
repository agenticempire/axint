import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateSwiftSources } from "../../src/core/swift-validator.js";

// ─── AX848 — nested type / static member access on a project type ─────
//
// Reproduces the IntelBriefItem.Kind class of miss documented in the
// 2026-05-03 dogfooding entry. The parent type is project-indexed; the
// nested name doesn't exist; AX848 fires with a "did you mean" hint.

describe("AX848 — nested type access on project-indexed type", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = join(tmpdir(), `axint-ax848-${Date.now()}`);
    mkdirSync(join(tmpRoot, "Models"), { recursive: true });
    writeFileSync(
      join(tmpRoot, "Models", "IntelBriefItem.swift"),
      `import Foundation

struct IntelBriefItem: Identifiable, Hashable {
    enum IntelKind: String, Codable {
        case insight, alert, opportunity
    }

    let id: UUID
    let headline: String
    let kind: IntelKind
}
`
    );
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("fires on the dogfooding IntelBriefItem.Kind miss", () => {
    const inputPath = join(tmpRoot, "Views", "BriefView.swift");
    mkdirSync(join(tmpRoot, "Views"), { recursive: true });
    const inputSource = `import SwiftUI

struct BriefView: View {
    let kind: IntelBriefItem.Kind

    var body: some View {
        Text("placeholder")
    }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax848 = results[0]!.diagnostics.filter((d) => d.code === "AX848");
    expect(ax848.length).toBeGreaterThanOrEqual(1);
    const hit = ax848[0]!;
    expect(hit.message).toContain("IntelBriefItem");
    expect(hit.message).toContain("Kind");
    // Levenshtein over { IntelKind, id, headline, kind } should pick IntelKind.
    expect(hit.message).toContain("IntelKind");
  });

  it("does not fire when the nested type exists", () => {
    const inputPath = join(tmpRoot, "Views", "OkView.swift");
    const inputSource = `import SwiftUI

struct OkView: View {
    let kind: IntelBriefItem.IntelKind

    var body: some View {
        Text("ok")
    }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax848 = results[0]!.diagnostics.filter((d) => d.code === "AX848");
    expect(ax848.length).toBe(0);
  });

  it("does not fire on language-reserved meta members like .self / .Type", () => {
    const inputPath = join(tmpRoot, "Views", "MetaView.swift");
    const inputSource = `import SwiftUI

struct MetaView: View {
    var body: some View {
        let _ = IntelBriefItem.self
        let _ = IntelBriefItem.Type.self
        Text("meta")
    }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax848 = results[0]!.diagnostics.filter((d) => d.code === "AX848");
    expect(ax848.length).toBe(0);
  });

  it("does not fire on declaration sites", () => {
    const inputPath = join(tmpRoot, "Models", "IntelBriefItemExt.swift");
    const inputSource = `import Foundation

extension IntelBriefItem {
    enum Sort: String { case recency, severity }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax848 = results[0]!.diagnostics.filter((d) => d.code === "AX848");
    expect(ax848.length).toBe(0);
  });
});

// ─── AX841 — typed-element-from-collection inference (extension) ──────
//
// Reproduces the `item.title` miss where `item` came from a ForEach loop
// over a typed collection. AX841 used to skip closure parameters as
// "untyped"; the extension binds them to the collection's element type.

describe("AX841 — typed iteration variable from project collection", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = join(tmpdir(), `axint-ax841-iter-${Date.now()}`);
    mkdirSync(join(tmpRoot, "Models"), { recursive: true });
    mkdirSync(join(tmpRoot, "Stores"), { recursive: true });
    writeFileSync(
      join(tmpRoot, "Models", "IntelBriefItem.swift"),
      `import Foundation

struct IntelBriefItem: Identifiable, Hashable {
    let id: UUID
    let headline: String
    let symbol: String
}
`
    );
    writeFileSync(
      join(tmpRoot, "Stores", "BriefStore.swift"),
      `import Foundation

@MainActor
final class BriefStore: ObservableObject {
    @Published var results: [IntelBriefItem] = []
}
`
    );
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("fires on item.title where the real field is headline (ForEach)", () => {
    const inputPath = join(tmpRoot, "Views", "BriefList.swift");
    mkdirSync(join(tmpRoot, "Views"), { recursive: true });
    const inputSource = `import SwiftUI

struct BriefList: View {
    @StateObject var store: BriefStore = BriefStore()

    var body: some View {
        ForEach(store.results) { item in
            Text(item.title)
        }
    }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax841 = results[0]!.diagnostics.filter((d) => d.code === "AX841");
    const titleHit = ax841.find((d) => d.message.includes("title"));
    expect(titleHit).toBeDefined();
    expect(titleHit!.message).toContain("IntelBriefItem");
    expect(titleHit!.message).toContain("headline");
  });

  it("fires on item.title in a for-in loop", () => {
    const inputPath = join(tmpRoot, "Views", "BriefForLoop.swift");
    const inputSource = `import SwiftUI

struct BriefForLoop: View {
    @StateObject var store: BriefStore = BriefStore()

    var body: some View {
        Text(headlines)
    }

    private var headlines: String {
        var lines: [String] = []
        for item in store.results {
            lines.append(item.title)
        }
        return lines.joined(separator: "\\n")
    }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax841 = results[0]!.diagnostics.filter((d) => d.code === "AX841");
    expect(ax841.find((d) => d.message.includes("title"))).toBeDefined();
  });

  it("does not fire on item.headline (real field)", () => {
    const inputPath = join(tmpRoot, "Views", "BriefOk.swift");
    const inputSource = `import SwiftUI

struct BriefOk: View {
    @StateObject var store: BriefStore = BriefStore()

    var body: some View {
        ForEach(store.results) { item in
            Text(item.headline)
        }
    }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax841 = results[0]!.diagnostics.filter((d) => d.code === "AX841");
    const headlineHit = ax841.find((d) => d.message.includes("headline"));
    expect(headlineHit).toBeUndefined();
  });
});
