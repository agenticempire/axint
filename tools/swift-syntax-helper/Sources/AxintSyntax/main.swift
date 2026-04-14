// axint-syntax — CLI entry point.
//
// Usage:
//   axint-syntax lint <file.swift>
//   cat file.swift | axint-syntax lint -
//
// Emits a JSON array of diagnostics on stdout:
//   [{"code":"AX701","severity":"error","line":12,"column":5,"message":"..."}]
//
// Exit codes: 0 = clean run (no errors reported), 1 = diagnostics emitted,
// 2 = argument or IO failure. The Node validator ignores exit codes and
// reads stdout directly — this matches what Nova wanted: diagnostics are
// data, not control flow.

import Foundation
import SwiftParser
import SwiftSyntax

@main
struct AxintSyntaxCLI {
    static func main() {
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            FileHandle.standardError.write(Data("usage: axint-syntax lint <file|->\n".utf8))
            exit(2)
        }

        let command = args[1]
        guard command == "lint" else {
            FileHandle.standardError.write(Data("axint-syntax: unknown command \(command)\n".utf8))
            exit(2)
        }

        let path = args.count >= 3 ? args[2] : "-"
        let source: String
        if path == "-" {
            source = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
        } else {
            guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
                  let text = String(data: data, encoding: .utf8) else {
                FileHandle.standardError.write(Data("axint-syntax: cannot read \(path)\n".utf8))
                exit(2)
            }
            source = text
        }

        let tree = Parser.parse(source: source)
        let locations = SourceLocationConverter(fileName: path, tree: tree)
        var diagnostics: [Diagnostic] = []

        let visitor = LintVisitor(locations: locations) { diagnostics.append($0) }
        visitor.walk(tree)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let payload = (try? encoder.encode(diagnostics)) ?? Data("[]".utf8)
        FileHandle.standardOutput.write(payload)
        FileHandle.standardOutput.write(Data("\n".utf8))

        exit(diagnostics.isEmpty ? 0 : 1)
    }
}
