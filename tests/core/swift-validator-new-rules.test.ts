import { describe, it, expect } from "vitest";
import { validateSwiftSources } from "../../src/core/swift-validator.js";

describe("AX787 — undefined boolean identifier", () => {
  it("fires on a deleted-then-still-referenced isAxintShowcase pattern", () => {
    const source = `
import SwiftUI

struct ProjectShowcaseView: View {
    var showcaseTheme: ShowcaseTheme = .standard

    var body: some View {
        VStack {
            if isAxintShowcase {
                Text("Carbon hero")
            }
            Text(isDreamweaverShowcase ? "Dreamweaver" : "Standard")
        }
    }
}
`;
    const [result] = validateSwiftSources([
      { file: "ProjectShowcaseView.swift", source },
    ]);
    const ax787 = result.diagnostics.filter((d) => d.code === "AX787");
    expect(ax787.length).toBeGreaterThanOrEqual(2);
    expect(ax787.some((d) => d.message.includes("isAxintShowcase"))).toBe(true);
    expect(ax787.some((d) => d.message.includes("isDreamweaverShowcase"))).toBe(true);
  });

  it("does not fire when the boolean is declared in the file", () => {
    const source = `
import SwiftUI

struct V: View {
    var isReady: Bool { true }
    var body: some View {
        if isReady { Text("ok") } else { Text("wait") }
    }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX787").length).toBe(0);
  });

  it("does not fire on Swift built-ins like isEmpty/hasPrefix", () => {
    const source = `
import Foundation

struct V {
    let items: [Int]
    var summary: String {
        if items.isEmpty { return "" }
        return "x"
    }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX787").length).toBe(0);
  });
});

describe("AX788 — HStack child collapses siblings via maxWidth: .infinity", () => {
  it("fires when SwarmGradientDivider is used as an HStack child", () => {
    const source = `
import SwiftUI

struct SwarmGradientDivider: View {
    var body: some View {
        Rectangle().frame(height: 1).frame(maxWidth: .infinity)
    }
}

struct StatRow: View {
    var body: some View {
        HStack {
            Text("25")
            SwarmGradientDivider()
            Text("Active Missions")
        }
    }
}
`;
    const [result] = validateSwiftSources([{ file: "Stat.swift", source }]);
    const ax788 = result.diagnostics.filter((d) => d.code === "AX788");
    expect(ax788.length).toBeGreaterThanOrEqual(1);
    expect(ax788[0]!.message).toContain("SwarmGradientDivider");
  });

  it("does not fire when the View has a fixed-width frame override at the call site", () => {
    const source = `
import SwiftUI

struct WideBar: View {
    var body: some View { Rectangle().frame(maxWidth: .infinity) }
}

struct Row: View {
    var body: some View {
        HStack {
            Text("a")
            WideBar().frame(width: 200)
            Text("b")
        }
    }
}
`;
    const [result] = validateSwiftSources([{ file: "Row.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX788").length).toBe(0);
  });
});

describe("AX789 — redundant Task @MainActor in lifecycle", () => {
  it("fires inside .onAppear", () => {
    const source = `
import SwiftUI

struct V: View {
    var body: some View {
        Text("hi")
            .onAppear {
                Task { @MainActor in
                    print("ok")
                }
            }
    }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    const ax789 = result.diagnostics.filter((d) => d.code === "AX789");
    expect(ax789.length).toBe(1);
    expect(ax789[0]!.message).toContain("onAppear");
  });

  it("fires inside .task", () => {
    const source = `
import SwiftUI

struct V: View {
    var body: some View {
        Text("hi")
            .task {
                Task { @MainActor in
                    print("ok")
                }
            }
    }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX789").length).toBe(1);
  });

  it("does not fire when Task @MainActor is outside a lifecycle block", () => {
    const source = `
import SwiftUI

struct V {
    func go() {
        Task { @MainActor in
            print("ok")
        }
    }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX789").length).toBe(0);
  });
});
