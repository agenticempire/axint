import Foundation
import XcodeKit

final class FixFileCommand: NSObject, XCSourceEditorCommand {
    func perform(
        with invocation: XCSourceEditorCommandInvocation,
        completionHandler: @escaping (Error?) -> Void
    ) {
        let buffer = invocation.buffer
        let original = buffer.completeBuffer
        let result = AxintFixer.fix(original)

        guard !result.applied.isEmpty else {
            completionHandler(NSError(
                domain: "com.axint.editor",
                code: 0,
                userInfo: [NSLocalizedDescriptionKey: "Nothing to fix — Swift looks clean."]
            ))
            return
        }

        buffer.lines.removeAllObjects()
        for line in result.source.components(separatedBy: "\n") {
            buffer.lines.add(line)
        }
        completionHandler(nil)
    }
}

final class StateLetCommand: NSObject, XCSourceEditorCommand {
    func perform(
        with invocation: XCSourceEditorCommandInvocation,
        completionHandler: @escaping (Error?) -> Void
    ) {
        let buffer = invocation.buffer
        let original = buffer.completeBuffer
        let result = AxintFixer.fix(original)
        let touched = result.applied.contains { $0.code == "AX703" }

        guard touched else {
            completionHandler(NSError(
                domain: "com.axint.editor",
                code: 0,
                userInfo: [NSLocalizedDescriptionKey: "No @State let declarations found."]
            ))
            return
        }

        buffer.lines.removeAllObjects()
        for line in result.source.components(separatedBy: "\n") {
            buffer.lines.add(line)
        }
        completionHandler(nil)
    }
}
