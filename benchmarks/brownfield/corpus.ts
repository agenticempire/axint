export interface BrownfieldCase {
  id: string;
  title: string;
  source: string;
  expectedCodes: string[];
  expectation: "clean" | "finding";
  rationale: string;
}

export const BROWNFIELD_CORPUS: BrownfieldCase[] = [
  {
    id: "clean-swiftui-view",
    title: "Ordinary compiling SwiftUI view",
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
    expectation: "finding",
    expectedCodes: ["AX721"],
    rationale: "This remains a concurrency advisory until compiler context confirms it.",
    source: `import Combine

final class ProfileModel: ObservableObject {
    @Published var name = ""
}
`,
  },
];
