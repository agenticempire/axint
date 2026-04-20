import PackagePlugin
import Foundation

/// AxintValidatePlugin
///
/// Runs `axint validate-swift` over the target's Swift sources before Swift
/// compilation. If the validator reports an error (AX701–AX799), the build
/// fails at the exact line, with a real diagnostic message — the kind Xcode
/// refuses to give you when an App Intent or Widget silently drops a
/// protocol requirement.
@main
struct AxintValidatePlugin: BuildToolPlugin {
    func createBuildCommands(context: PluginContext, target: Target) async throws -> [Command] {
        guard let sourceTarget = target as? SourceModuleTarget else {
            return []
        }

        let (executablePath, prefixArgs) = try resolveCompiler()
        let inputFiles = sourceTarget.sourceFiles
            .filter { $0.path.extension == "swift" }
            .map { $0.path }

        guard !inputFiles.isEmpty else { return [] }

        let workDir = context.pluginWorkDirectory
        let sentinel = workDir.appending("axint-validate.ok")
        let fixPacketDirectory = workDir.appending("fix").appending("validate")

        try FileManager.default.createDirectory(
            at: fixPacketDirectory.asURL,
            withIntermediateDirectories: true,
            attributes: nil
        )

        let args = prefixArgs
            + ["validate-swift", "--quiet", "--fix-packet-dir", fixPacketDirectory.string]
            + inputFiles.map { $0.string }

        return [
            .buildCommand(
                displayName: "Axint: validating \(inputFiles.count) Swift file\(inputFiles.count == 1 ? "" : "s")",
                executable: executablePath,
                arguments: args,
                inputFiles: inputFiles,
                outputFiles: [sentinel]
            )
        ]
    }

    private func resolveCompiler() throws -> (Path, [String]) {
        if let axintPath = try findInPath("axint") {
            return (axintPath, [])
        }
        if let npxPath = try findInPath("npx") {
            return (npxPath, ["-y", "-p", "@axint/compiler", "axint"])
        }
        throw AxintValidateError.executableNotFound(
            """
            The 'axint' compiler was not found in your PATH.

            Install it globally:
              npm install -g @axint/compiler

            Or ensure Node.js and npx are available so the plugin can
            fetch the compiler automatically.
            """
        )
    }

    private func findInPath(_ name: String) throws -> Path? {
        let pathEnv = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/local/bin:/usr/bin:/bin"
        for component in pathEnv.split(separator: ":") {
            let full = Path("\(component)/\(name)")
            if FileManager.default.fileExists(atPath: full.string) {
                return full
            }
        }
        return nil
    }
}

enum AxintValidateError: Error, CustomStringConvertible {
    case executableNotFound(String)
    var description: String {
        switch self {
        case .executableNotFound(let msg): return "Axint Validate Plugin: \(msg)"
        }
    }
}

#if canImport(XcodeProjectPlugin)
import XcodeProjectPlugin

extension AxintValidatePlugin: XcodeBuildToolPlugin {
    func createBuildCommands(context: XcodePluginContext, target: XcodeTarget) throws -> [Command] {
        let (executablePath, prefixArgs) = try resolveCompiler()

        let inputFiles = target.inputFiles
            .filter { $0.path.extension == "swift" }
            .map { $0.path }

        guard !inputFiles.isEmpty else { return [] }

        let workDir = context.pluginWorkDirectory
        let sentinel = workDir.appending("axint-validate.ok")
        let fixPacketDirectory = workDir.appending("fix").appending("validate")

        try? FileManager.default.createDirectory(
            at: fixPacketDirectory.asURL,
            withIntermediateDirectories: true,
            attributes: nil
        )

        let args = prefixArgs
            + ["validate-swift", "--quiet", "--fix-packet-dir", fixPacketDirectory.string]
            + inputFiles.map { $0.string }

        return [
            .buildCommand(
                displayName: "Axint: validating \(inputFiles.count) Swift file\(inputFiles.count == 1 ? "" : "s")",
                executable: executablePath,
                arguments: args,
                inputFiles: inputFiles,
                outputFiles: [sentinel]
            )
        ]
    }
}
#endif
