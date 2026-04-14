import Foundation

struct Diagnostic: Codable {
    let code: String
    let severity: Severity
    let line: Int
    let column: Int
    let message: String

    enum Severity: String, Codable {
        case error
        case warning
    }
}
