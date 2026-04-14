import Foundation
import XcodeKit

final class SourceEditorExtension: NSObject, XCSourceEditorExtension {
    var commandDefinitions: [[XCSourceEditorCommandDefinitionKey: Any]] {
        [
            command(.fixSelection,  name: "Axint: Auto-fix this file"),
            command(.validate,      name: "Axint: Validate this file"),
            command(.stateLetToVar, name: "Axint: @State let → @State var"),
        ]
    }

    private func command(_ id: AxintCommand, name: String) -> [XCSourceEditorCommandDefinitionKey: Any] {
        [
            .classNameKey:      "\(Bundle.main.bundleIdentifier!).\(id.className)",
            .identifierKey:     id.rawValue,
            .nameKey:           name,
        ]
    }
}

enum AxintCommand: String {
    case fixSelection   = "fix-file"
    case validate       = "validate-file"
    case stateLetToVar  = "state-let-to-var"

    var className: String {
        switch self {
        case .fixSelection:  return "FixFileCommand"
        case .validate:      return "ValidateCommand"
        case .stateLetToVar: return "StateLetCommand"
        }
    }
}
