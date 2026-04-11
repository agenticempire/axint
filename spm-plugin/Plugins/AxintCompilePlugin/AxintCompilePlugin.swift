import PackagePlugin
import Foundation

@main
struct AxintCompilePlugin: BuildToolPlugin {
    func createBuildCommands(context: PluginContext, target: Target) async throws -> [Command] {
        guard let sourceTarget = target as? SourceModuleTarget else {
            return []
        }

        let (executablePath, prefixArgs) = try resolveCompiler()

        var commands: [Command] = []

        let tsFiles = sourceTarget.sourceFiles.filter { sourceFile in
            sourceFile.path.string.hasSuffix(".ts") && !sourceFile.path.string.hasSuffix(".d.ts")
        }

        let outputDirectory = context.pluginWorkDirectory.appending("compiled")

        try FileManager.default.createDirectory(
            at: outputDirectory.asURL,
            withIntermediateDirectories: true,
            attributes: nil
        )

        for sourceFile in tsFiles {
            let inputPath = sourceFile.path
            let inputFileName = inputPath.lastComponent

            // The compiler emits <IntentName>Intent.swift based on the intent's
            // `name` field, not the source filename. We also can't predict the
            // companion fragment names (.plist.fragment.xml, .entitlements.fragment.xml).
            // Use prebuildCommand so SwiftPM discovers outputs by scanning the
            // directory instead of requiring us to declare them upfront.
            let compileArgs: [String] = prefixArgs + [
                "compile",
                inputPath.string,
                "--out", outputDirectory.string,
                "--emit-info-plist",
                "--emit-entitlements",
            ]

            let command = Command.prebuildCommand(
                displayName: "Compiling TypeScript Intent: \(inputFileName)",
                executable: executablePath,
                arguments: compileArgs,
                outputFilesDirectory: outputDirectory
            )

            commands.append(command)
        }

        return commands
    }

    /// Returns (executable, prefixArgs). When `axint` is in PATH the prefix
    /// is empty. When only `npx` is available, the prefix contains the flags
    /// needed to install and run the @axintai/compiler package.
    private func resolveCompiler() throws -> (Path, [String]) {
        if let axintPath = try findInPath("axint") {
            return (axintPath, [])
        }

        if let npxPath = try findInPath("npx") {
            return (npxPath, ["-y", "-p", "@axintai/compiler", "axint"])
        }

        throw AxintPluginError.executableNotFound(
            """
            The 'axint' compiler was not found in your PATH.

            Install it globally:
              npm install -g @axintai/compiler

            Or ensure Node.js and npx are available so the plugin can
            fetch the compiler automatically.

            More info: https://github.com/agenticempire/axint
            """
        )
    }

    private func findInPath(_ executableName: String) throws -> Path? {
        let pathEnvironment = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/local/bin:/usr/bin:/bin"
        let pathComponents = pathEnvironment.split(separator: ":")

        for pathComponent in pathComponents {
            let fullPath = Path("\(pathComponent)/\(executableName)")
            let fileManager = FileManager.default

            if fileManager.fileExists(atPath: fullPath.string) {
                return fullPath
            }
        }

        return nil
    }
}

enum AxintPluginError: Error, CustomStringConvertible {
    case executableNotFound(String)

    var description: String {
        switch self {
        case .executableNotFound(let message):
            return "Axint Plugin Error: \(message)"
        }
    }
}
