// Inline port of the AX703/AX701/AX702/AX704/AX714 mechanical fixers.
//
// Source Editor Extensions run sandboxed and cannot shell out to the axint
// CLI, so we ship a Swift implementation of the rules that have unambiguous
// rewrites. The TypeScript fixer in src/core/swift-fixer.ts is the source of
// truth — keep this file in lockstep.

import Foundation

struct AxintFix: Equatable {
    let code: String
    let message: String
}

struct AxintFixResult {
    let source: String
    let applied: [AxintFix]
}

enum AxintFixer {
    static func fix(_ source: String) -> AxintFixResult {
        var current = source
        var applied: [AxintFix] = []

        for wrapper in PropertyWrapper.allCases {
            let (next, count) = rewritePropertyWrapperLet(current, wrapper: wrapper)
            if count > 0 {
                current = next
                applied.append(.init(
                    code: "AX703",
                    message: "rewrote \(count) `\(wrapper.rawValue) let` → `\(wrapper.rawValue) var`"
                ))
            }
        }

        if let next = injectAppIntentPerform(current) {
            current = next
            applied.append(.init(code: "AX701", message: "injected perform() into AppIntent"))
        }

        if let next = injectWidgetBody(current) {
            current = next
            applied.append(.init(code: "AX702", message: "injected body into Widget"))
        }

        if let next = injectAppIntentTitle(current) {
            current = next
            applied.append(.init(code: "AX704", message: "injected title into AppIntent"))
        }

        if let next = injectAppSceneBody(current) {
            current = next
            applied.append(.init(code: "AX714", message: "injected Scene body into App"))
        }

        return AxintFixResult(source: current, applied: applied)
    }

    // MARK: – property wrappers

    private enum PropertyWrapper: String, CaseIterable {
        case state              = "@State"
        case binding            = "@Binding"
        case observedObject     = "@ObservedObject"
        case stateObject        = "@StateObject"
        case environmentObject  = "@EnvironmentObject"
    }

    private static func rewritePropertyWrapperLet(
        _ source: String,
        wrapper: PropertyWrapper
    ) -> (String, Int) {
        // Match @Wrapper(args)? let identifier — replace `let` with `var`.
        let pattern = "(\(NSRegularExpression.escapedPattern(for: wrapper.rawValue))(?:\\([^)]*\\))?\\s+)let(\\s+[A-Za-z_])"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return (source, 0)
        }
        let range = NSRange(source.startIndex..., in: source)
        let matches = regex.matches(in: source, options: [], range: range)
        if matches.isEmpty { return (source, 0) }
        let rewritten = regex.stringByReplacingMatches(
            in: source,
            options: [],
            range: range,
            withTemplate: "$1var$2"
        )
        return (rewritten, matches.count)
    }

    // MARK: – AppIntent perform stub

    private static let appIntentPerformStub = """

            func perform() async throws -> some IntentResult {
                .result()
            }

    """

    private static func injectAppIntentPerform(_ source: String) -> String? {
        injectIfMissing(
            source: source,
            structDeclaration: #"struct\s+(\w+)\s*:\s*[^{]*\bAppIntent\b"#,
            sentinel: "func perform(",
            stub: appIntentPerformStub
        )
    }

    // MARK: – Widget body stub

    private static let widgetBodyStub = """

            var body: some WidgetConfiguration {
                StaticConfiguration(kind: kind, provider: Provider()) { entry in
                    Text("Hello, world!")
                }
            }

    """

    private static func injectWidgetBody(_ source: String) -> String? {
        injectIfMissing(
            source: source,
            structDeclaration: #"struct\s+(\w+)\s*:\s*[^{]*\bWidget\b"#,
            sentinel: "var body",
            stub: widgetBodyStub
        )
    }

    // MARK: – AppIntent title stub

    private static let appIntentTitleStub = """

            static var title: LocalizedStringResource = "Untitled Intent"

    """

    private static func injectAppIntentTitle(_ source: String) -> String? {
        injectIfMissing(
            source: source,
            structDeclaration: #"struct\s+(\w+)\s*:\s*[^{]*\bAppIntent\b"#,
            sentinel: "static var title",
            stub: appIntentTitleStub
        )
    }

    // MARK: – App Scene body stub

    private static let appSceneBodyStub = """

            var body: some Scene {
                WindowGroup {
                    ContentView()
                }
            }

    """

    private static func injectAppSceneBody(_ source: String) -> String? {
        injectIfMissing(
            source: source,
            structDeclaration: #"struct\s+(\w+)\s*:\s*[^{]*\bApp\b"#,
            sentinel: "var body",
            stub: appSceneBodyStub
        )
    }

    // MARK: – injection helper

    /// Finds the first `struct Name: Protocol { ... }` block whose body does
    /// not contain `sentinel`, and inserts `stub` immediately after the
    /// opening brace. Returns nil if no such block exists.
    private static func injectIfMissing(
        source: String,
        structDeclaration pattern: String,
        sentinel: String,
        stub: String
    ) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return nil
        }
        let nsRange = NSRange(source.startIndex..., in: source)
        let matches = regex.matches(in: source, options: [], range: nsRange)

        for match in matches {
            guard let declRange = Range(match.range, in: source) else { continue }
            // Find opening brace after the declaration.
            guard let openBrace = source.range(of: "{", range: declRange.upperBound..<source.endIndex) else {
                continue
            }
            // Find matching close brace.
            guard let closeBrace = matchingCloseBrace(in: source, openAt: openBrace.lowerBound) else {
                continue
            }
            let body = source[openBrace.upperBound..<closeBrace]
            if body.contains(sentinel) { continue }

            var result = source
            result.insert(contentsOf: stub, at: openBrace.upperBound)
            return result
        }
        return nil
    }

    private static func matchingCloseBrace(in source: String, openAt: String.Index) -> String.Index? {
        var depth = 0
        var idx = openAt
        while idx < source.endIndex {
            let c = source[idx]
            if c == "{" { depth += 1 }
            if c == "}" {
                depth -= 1
                if depth == 0 { return idx }
            }
            idx = source.index(after: idx)
        }
        return nil
    }
}
