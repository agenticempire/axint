import { describe, expect, it } from "vitest";
import { fixSwiftSource } from "../../src/core/swift-fixer.js";
import { validateSwiftSource } from "../../src/core/swift-validator.js";

function codes(source: string) {
  return validateSwiftSource(source, "IOS27.swift").diagnostics.map(
    (diagnostic) => diagnostic.code
  );
}

describe("iOS 27 beta 3 Swift migration diagnostics", () => {
  it("finds an @State initial value that conflicts with init assignment", () => {
    expect(
      codes(`
        import SwiftUI
        struct StickerPageView: View {
          @State private var page = StickerPage()
          init(title: String) {
            self.page = StickerPage(title: title)
          }
          var body: some View { Text("Page") }
        }
      `)
    ).toContain("AX861");
  });

  it("finds extension delegation to a synthesized initializer disabled by @State", () => {
    expect(
      codes(`
        import SwiftUI
        struct StickerPageView: View {
          @State private var page: StickerPage
          private let title: String
          var body: some View { Text(title) }
        }
        extension StickerPageView {
          init(title: String, page: StickerPage) {
            self.init(page: page, title: title)
          }
        }
      `)
    ).toContain("AX862");
  });

  it("finds deprecated document and On Demand Resources APIs", () => {
    const result = codes(`
      import SwiftUI
      struct ProjectDocument: FileDocument {
        static var readableContentTypes: [UTType] { [] }
      }
      let request = NSBundleResourceRequest(tags: ["starter"])
    `);
    expect(result).toContain("AX863");
    expect(result).toContain("AX867");
  });

  it("finds old document isolation, toolbar, and text field styles", () => {
    const result = codes(`
      import SwiftUI
      struct Reader: DocumentReader {
        nonisolated func read(from source: URL, progress: Progress) async throws {}
      }
      struct FormView: View {
        var body: some View {
          TextField("Name", text: .constant(""))
            .textFieldStyle(.roundedBorder)
            .toolbarMinimizeBehavior(.onScrollDown)
        }
      }
    `);
    expect(result).toEqual(expect.arrayContaining(["AX864", "AX865", "AX866"]));
  });

  it("finds missing PCC sampling options", () => {
    expect(
      codes(`
        import FoundationModels
        let model = PrivateCloudComputeLanguageModel()
        let session = LanguageModelSession(model: model)
      `)
    ).toContain("AX868");
    expect(
      codes(`
        import FoundationModels
        let model = PrivateCloudComputeLanguageModel()
        let options = GenerationOptions(
          samplingMode: .randomThreshold(0.95, seed: 42)
        )
      `)
    ).not.toContain("AX868");
  });

  it("finds text-selection gestures and hidden selected tabs", () => {
    const result = codes(`
      import SwiftUI
      struct DetailView: View {
        @State private var selection = 0
        var body: some View {
          VStack {
            Text("Selectable")
              .gesture(TapGesture())
              .textSelection(.enabled)
            TabView(selection: $selection) {
              Text("One").tag(0)
              Text("Two").tag(1).hidden()
            }
          }
        }
      }
    `);
    expect(result).toEqual(expect.arrayContaining(["AX869", "AX870"]));
  });

  it("keeps release-note heuristics advisory and non-blocking", () => {
    const diagnostic = validateSwiftSource(
      `
        import SwiftUI
        struct LegacyDocument: FileDocument {
          static var readableContentTypes: [UTType] { [] }
        }
      `,
      "LegacyDocument.swift"
    ).diagnostics.find((item) => item.code === "AX863");

    expect(diagnostic?.confidence).toBe("advisory");
    expect(diagnostic?.blocking).toBe(false);
  });

  it("mechanically fixes the two unambiguous SwiftUI renames", () => {
    const fixed = fixSwiftSource(
      `
        TextField("Name", text: .constant(""))
          .textFieldStyle(.squareBorder)
          .toolbarMinimizeBehavior(.onScrollDown)
      `,
      "Fix.swift"
    );

    expect(fixed.source).toContain(".textFieldStyle(.bordered)");
    expect(fixed.source).toContain(".toolbarMinimizationBehavior(");
    expect(fixed.fixed.map((item) => item.code)).toEqual(
      expect.arrayContaining(["AX865", "AX866"])
    );
  });
});
