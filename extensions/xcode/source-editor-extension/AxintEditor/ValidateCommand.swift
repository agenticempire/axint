import Foundation
import XcodeKit

/// "Axint: Validate this file" surfaces issues by raising a localized error
/// — Xcode shows the message in a banner at the top of the editor.
final class ValidateCommand: NSObject, XCSourceEditorCommand {
    func perform(
        with invocation: XCSourceEditorCommandInvocation,
        completionHandler: @escaping (Error?) -> Void
    ) {
        let source = invocation.buffer.completeBuffer
        let issues = AxintValidator.validate(source)

        if issues.isEmpty {
            completionHandler(NSError(
                domain: "com.axint.editor",
                code: 0,
                userInfo: [NSLocalizedDescriptionKey: "✓ Axint validation passed."]
            ))
            return
        }

        let summary = issues
            .prefix(5)
            .map { "[\($0.code)] line \($0.line): \($0.message)" }
            .joined(separator: "\n")
        let more = issues.count > 5 ? "\n…and \(issues.count - 5) more" : ""

        completionHandler(NSError(
            domain: "com.axint.editor",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "\(issues.count) issue(s):\n\(summary)\(more)"]
        ))
    }
}

struct AxintIssue {
    let code: String
    let line: Int
    let message: String
}

/// Companion to AxintFixer — surfaces the same diagnostics without rewriting.
enum AxintValidator {
    static func validate(_ source: String) -> [AxintIssue] {
        var issues: [AxintIssue] = []
        let lines = source.components(separatedBy: "\n")

        for (idx, line) in lines.enumerated() {
            for wrapper in ["@State", "@Binding", "@ObservedObject", "@StateObject", "@EnvironmentObject"] {
                if line.range(of: "\(wrapper)\\b.*\\blet\\b", options: .regularExpression) != nil {
                    issues.append(.init(
                        code: "AX703",
                        line: idx + 1,
                        message: "\(wrapper) properties must be `var`, not `let`."
                    ))
                }
            }
        }

        if source.contains("AppIntent") && !source.contains("func perform(") {
            issues.append(.init(code: "AX701", line: 1, message: "AppIntent is missing perform()."))
        }
        if source.contains("AppIntent") && !source.contains("static var title") {
            issues.append(.init(code: "AX704", line: 1, message: "AppIntent is missing a title."))
        }

        return issues
    }
}
