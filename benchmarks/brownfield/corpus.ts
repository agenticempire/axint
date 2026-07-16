export interface BrownfieldCase {
  id: string;
  title: string;
  category:
    | "swiftui"
    | "uikit"
    | "app-intents"
    | "widgetkit"
    | "concurrency"
    | "accessibility"
    | "interaction"
    | "documents"
    | "foundation-models"
    | "background-assets";
  platform: "all" | "iOS" | "macOS" | "watchOS" | "visionOS";
  provenance: "hand-labeled-regression" | "anonymized-project-fixture";
  source: string;
  expectedCodes: string[];
  expectation: "clean" | "finding";
  rationale: string;
}

export const BROWNFIELD_CORPUS: BrownfieldCase[] = [
  {
    id: "clean-swiftui-view",
    title: "Ordinary compiling SwiftUI view",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "A minimal View with a declared body should not produce a finding.",
    source: `import SwiftUI

struct WelcomeView: View {
    let name: String

    var body: some View {
        Text("Welcome, \\(name)")
    }
}
`,
  },
  {
    id: "valid-app-intent",
    title: "Complete App Intent",
    category: "app-intents",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "A complete AppIntent contract should abstain.",
    source: `import AppIntents

struct OpenJournalIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Journal"
    static var description = IntentDescription("Opens the journal")

    func perform() async throws -> some IntentResult {
        .result()
    }
}
`,
  },
  {
    id: "container-accessibility-identifier",
    title: "Container identifier can hide child identifiers",
    category: "accessibility",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX736"],
    rationale: "This is an accessibility advisory that compile success cannot disprove.",
    source: `import SwiftUI

struct LoginView: View {
    var body: some View {
        VStack {
            TextField("Email", text: .constant(""))
                .accessibilityIdentifier("email-field")
        }
        .accessibilityIdentifier("login-form")
    }
}
`,
  },
  {
    id: "input-overlay-hit-testing",
    title: "Text input overlay without hit-testing policy",
    category: "interaction",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX764"],
    rationale: "The overlay is a runtime interaction advisory, not a compiler error.",
    source: `import SwiftUI

struct ComposerView: View {
    @State private var draft = ""

    var body: some View {
        TextEditor(text: $draft)
            .overlay { Text("Write a note") }
    }
}
`,
  },
  {
    id: "invalid-frame-overload",
    title: "Invalid SwiftUI frame overload",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX765"],
    rationale: "This compiler-shaped call should be probable until Xcode confirms it.",
    source: `import SwiftUI

struct BrokenFrameView: View {
    var body: some View {
        Text("Broken")
            .frame(maxWidth: .infinity, height: 44)
    }
}
`,
  },
  {
    id: "missing-swiftui-import",
    title: "View without SwiftUI import",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX718"],
    rationale: "The source declares View without importing its framework.",
    source: `struct MissingImportView: View {
    var body: some View {
        Text("Missing import")
    }
}
`,
  },
  {
    id: "undeclared-view-property",
    title: "View body references an undeclared property",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX739"],
    rationale: "The member is absent from the local View declaration.",
    source: `import SwiftUI

struct ProfileView: View {
    var body: some View {
        Text(displayName)
    }
}
`,
  },
  {
    id: "observable-object-isolation",
    title: "UI ObservableObject without explicit isolation",
    category: "concurrency",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX721"],
    rationale: "This remains a concurrency advisory until compiler context confirms it.",
    source: `import Combine

final class ProfileModel: ObservableObject {
    @Published var name = ""
}
`,
  },
  {
    id: "clean-uikit-controller",
    title: "Ordinary UIKit view controller",
    category: "uikit",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "UIKit code outside Axint's targeted rules should be left alone.",
    source: `import UIKit

final class ProfileViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
    }
}
`,
  },
  {
    id: "clean-main-actor-model",
    title: "Explicitly isolated observable model",
    category: "concurrency",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "An ObservableObject already isolated to the main actor should abstain.",
    source: `import Combine

@MainActor
final class SessionModel: ObservableObject {
    @Published var isSignedIn = false
}
`,
  },
  {
    id: "clean-actor-state",
    title: "Actor with immutable nonisolated identifier",
    category: "concurrency",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "Ordinary actor isolation should not produce migration advice.",
    source: `actor ImageCache {
    nonisolated let identifier = "images"
    private var values: [String: Data] = [:]
}
`,
  },
  {
    id: "clean-input-overlay",
    title: "Decorative input overlay disables hit testing",
    category: "interaction",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "An explicitly non-interactive overlay should abstain.",
    source: `import SwiftUI

struct SearchField: View {
    @State private var query = ""

    var body: some View {
        TextField("Search", text: $query)
            .overlay { Image(systemName: "magnifyingglass").allowsHitTesting(false) }
    }
}
`,
  },
  {
    id: "clean-frame-chain",
    title: "Valid split SwiftUI frame modifiers",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale:
      "Valid frame overloads should not be confused with the mixed overload error.",
    source: `import SwiftUI

struct ToolbarTitle: View {
    var body: some View {
        Text("Library")
            .frame(maxWidth: .infinity)
            .frame(height: 44)
    }
}
`,
  },
  {
    id: "clean-sendable-value",
    title: "Immutable Sendable value",
    category: "concurrency",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "A value type with immutable Sendable state should abstain.",
    source: `struct SearchRequest: Sendable {
    let query: String
    let limit: Int
}
`,
  },
  {
    id: "app-intent-missing-perform",
    title: "App Intent missing perform",
    category: "app-intents",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX701"],
    rationale:
      "An AppIntent without perform cannot satisfy its required execution contract.",
    source: `import AppIntents

struct ArchiveNoteIntent: AppIntent {
    static var title: LocalizedStringResource = "Archive Note"
}
`,
  },
  {
    id: "state-wrapper-let",
    title: "SwiftUI State declared as let",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX703"],
    rationale: "State property wrappers require mutable storage.",
    source: `import SwiftUI

struct CounterView: View {
    @State private let count = 0
    var body: some View { Text("\\(count)") }
}
`,
  },
  {
    id: "widget-missing-body",
    title: "Widget missing configuration body",
    category: "widgetkit",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX702"],
    rationale: "A Widget must expose its WidgetConfiguration body.",
    source: `import SwiftUI
import WidgetKit

struct FocusWidget: Widget {
    let kind = "FocusWidget"
}
`,
  },
  {
    id: "timeline-entry-missing-date",
    title: "Timeline entry missing date",
    category: "widgetkit",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX713"],
    rationale: "TimelineEntry requires a Date used by WidgetKit scheduling.",
    source: `import WidgetKit

struct FocusEntry: TimelineEntry {
    let title: String
}
`,
  },
  {
    id: "unchecked-sendable",
    title: "Unchecked Sendable reference type",
    category: "concurrency",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX723"],
    rationale: "Unchecked Sendable is an explicit concurrency review boundary.",
    source: `final class LegacyCache: @unchecked Sendable {
    var values: [String: String] = [:]
}
`,
  },
  {
    id: "detached-task-context-loss",
    title: "Detached task loses actor context",
    category: "concurrency",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX726"],
    rationale:
      "Task.detached should remain visible as a structured-concurrency advisory.",
    source: `func refresh() {
    Task.detached {
        await loadRemoteState()
    }
}
`,
  },
  {
    id: "ios27-state-initializer-conflict",
    title: "State macro declaration and init assignment conflict",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX861"],
    rationale:
      "Xcode 27 state macro migration should identify declaration-site initialization that conflicts with init assignment.",
    source: `import SwiftUI

struct StickerPageView: View {
    @State private var page = StickerPage()

    init(title: String) {
        self.page = StickerPage(title: title)
    }

    var body: some View { Text("Page") }
}
`,
  },
  {
    id: "clean-ios27-state-initializer",
    title: "State macro initializer assigns uninitialized state",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale:
      "The Xcode 27 migration pattern without a declaration-site value should abstain.",
    source: `import SwiftUI

struct StickerPageView: View {
    @State private var page: StickerPage

    init(title: String) {
        self.page = StickerPage(title: title)
    }

    var body: some View { Text("Page") }
}
`,
  },
  {
    id: "ios27-file-document",
    title: "Deprecated FileDocument conformance",
    category: "documents",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX863"],
    rationale: "The 27 SDK deprecates FileDocument in favor of Document protocols.",
    source: `import SwiftUI
import UniformTypeIdentifiers

struct ProjectDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
}
`,
  },
  {
    id: "clean-ios27-document",
    title: "Current Document conformance",
    category: "documents",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "A Document-based type should not receive legacy protocol advice.",
    source: `import SwiftUI

struct ProjectDocument: Document {
}
`,
  },
  {
    id: "ios27-document-nonisolated",
    title: "Legacy nonisolated document reader",
    category: "documents",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX864"],
    rationale: "DocumentReader requirements use @concurrent in the 27 SDK.",
    source: `import SwiftUI

struct ProjectReader: DocumentReader {
    nonisolated func read(from source: URL, progress: Progress) async throws {
    }
}
`,
  },
  {
    id: "clean-ios27-document-concurrent",
    title: "Current concurrent document reader",
    category: "documents",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "The 27 SDK @concurrent requirement should abstain.",
    source: `import SwiftUI

struct ProjectReader: DocumentReader {
    @concurrent
    func read(from source: URL, progress: Progress) async throws {
    }
}
`,
  },
  {
    id: "ios27-toolbar-minimize",
    title: "Pre-27 toolbar minimization spelling",
    category: "swiftui",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX865"],
    rationale: "The old modifier spelling has an exact 27 SDK replacement.",
    source: `import SwiftUI

struct LibraryView: View {
    var body: some View {
        Text("Library")
            .toolbarMinimizeBehavior(.onScrollDown)
    }
}
`,
  },
  {
    id: "clean-ios27-toolbar-minimization",
    title: "Current toolbar minimization spelling",
    category: "swiftui",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "The current toolbar minimization API should abstain.",
    source: `import SwiftUI

struct LibraryView: View {
    var body: some View {
        Text("Library")
            .toolbarMinimizationBehavior(.onScrollDown)
    }
}
`,
  },
  {
    id: "ios27-text-field-style",
    title: "Soft-deprecated text field style",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX866"],
    rationale: "The 27 SDK prefers the bordered text field style.",
    source: `import SwiftUI

struct NameField: View {
    @State private var name = ""
    var body: some View {
        TextField("Name", text: $name)
            .textFieldStyle(.roundedBorder)
    }
}
`,
  },
  {
    id: "clean-ios27-text-field-style",
    title: "Current bordered text field style",
    category: "swiftui",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "The current bordered style should abstain.",
    source: `import SwiftUI

struct NameField: View {
    @State private var name = ""
    var body: some View {
        TextField("Name", text: $name)
            .textFieldStyle(.bordered)
    }
}
`,
  },
  {
    id: "ios27-on-demand-resources",
    title: "Deprecated On Demand Resources request",
    category: "background-assets",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX867"],
    rationale: "NSBundleResourceRequest is deprecated in favor of Background Assets.",
    source: `import Foundation

let request = NSBundleResourceRequest(tags: ["starter-pack"])
`,
  },
  {
    id: "clean-ios27-background-assets",
    title: "Background Assets download declaration",
    category: "background-assets",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "Background Assets code should not receive On Demand Resources advice.",
    source: `import BackgroundAssets

let downloadIdentifier = "starter-pack"
`,
  },
  {
    id: "ios27-pcc-greedy-decoding",
    title: "Private Cloud model without sampling options",
    category: "foundation-models",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX868"],
    rationale:
      "Beta 3 PCC defaults to greedy decoding without an explicit sampling mode.",
    source: `import FoundationModels

let model = PrivateCloudComputeLanguageModel()
let session = LanguageModelSession(model: model)
`,
  },
  {
    id: "clean-ios27-pcc-sampling",
    title: "Private Cloud model with seeded sampling",
    category: "foundation-models",
    platform: "all",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "An explicit seeded sampling mode should satisfy the beta 3 guidance.",
    source: `import FoundationModels

let model = PrivateCloudComputeLanguageModel()
let options = GenerationOptions(
    samplingMode: .randomThreshold(0.95, seed: 42)
)
`,
  },
  {
    id: "ios27-text-selection-gesture",
    title: "Selectable text with competing gesture",
    category: "interaction",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX869"],
    rationale:
      "iOS 27 text selection adds gestures that can compete with custom gestures.",
    source: `import SwiftUI

struct SelectableTitle: View {
    var body: some View {
        Text("Long title")
            .gesture(TapGesture())
            .textSelection(.enabled)
    }
}
`,
  },
  {
    id: "clean-ios27-text-selection-gesture",
    title: "Selectable text with explicit high-priority gesture",
    category: "interaction",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "An explicit high-priority gesture policy should abstain.",
    source: `import SwiftUI

struct SelectableTitle: View {
    var body: some View {
        Text("Long title")
            .highPriorityGesture(TapGesture())
            .textSelection(.enabled)
    }
}
`,
  },
  {
    id: "ios27-hidden-selected-tab",
    title: "Selected TabView contains a hidden tab path",
    category: "interaction",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "finding",
    expectedCodes: ["AX870"],
    rationale: "iOS 27 requires TabView selection to point to a visible tab.",
    source: `import SwiftUI

struct RootTabs: View {
    @State private var selection = 0
    var body: some View {
        TabView(selection: $selection) {
            Text("Home").tag(0)
            Text("Admin").tag(1).hidden()
        }
    }
}
`,
  },
  {
    id: "clean-ios27-visible-tabs",
    title: "Selected TabView contains only visible tabs",
    category: "interaction",
    platform: "iOS",
    provenance: "hand-labeled-regression",
    expectation: "clean",
    expectedCodes: [],
    rationale: "A selected TabView with visible tabs should abstain.",
    source: `import SwiftUI

struct RootTabs: View {
    @State private var selection = 0
    var body: some View {
        TabView(selection: $selection) {
            Text("Home").tag(0)
            Text("Settings").tag(1)
        }
    }
}
`,
  },
];
