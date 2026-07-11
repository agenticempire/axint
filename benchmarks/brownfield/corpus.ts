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
    | "interaction";
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
    rationale: "Valid frame overloads should not be confused with the mixed overload error.",
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
    rationale: "An AppIntent without perform cannot satisfy its required execution contract.",
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
    rationale: "Task.detached should remain visible as a structured-concurrency advisory.",
    source: `func refresh() {
    Task.detached {
        await loadRemoteState()
    }
}
`,
  },
];
