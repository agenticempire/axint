import PackagePlugin
import Foundation

@main
struct AxintCompilePlugin: BuildToolPlugin {
    /// Implements the build tool plugin capability.
    /// Scans for TypeScript files and compiles them to Swift using Axint.
    func createBuildCommands(context: PluginContext, target: Target) async throws -> [Command] {
        guard let sourceTarget = target as? SourceModuleTarget else {
            return []
        }

        // Resolve the compiler. When axint is in PATH we call it directly;
        // when only npx is available we invoke npx -y -p @axintai/compiler axint.
        let (executablePath, prefixArgs) = try resolveCompiler()

        var commands: [Command] = []

        let tsFiles = sourceTarget.sourceFiles.filter { sourceFile in
            sourceFile.path.string.hasSuffix(".ts") && !sourceFile.path.string.hasSuffix(".d.ts")
        }

        for sourceFile in tsFiles {
            let inputPath = sourceFile.path
            let outputDirectory = context.pluginWorkDirectory.appending("compiled")

            try FileManager.default.createDirectory(
                at: outputDirectory.asURL,
                withIntermediateDirectories: true,
                attributes: nil
            )

            let inputFileName = inputPath.lastComponent
            let baseName = inputFileName.replacingOccurrences(of: ".ts", with: "")

            // axint compile writes <Name>Intent.swift alongside .plist and .entitlements
            let intentSwift = outputDirectory.appending("\(baseName)Intent.swift")
            let intentPlist = outputDirectory.appending("\(baseName).plist")
            let intentEntitlements = outputDirectory.appending("\(baseName).entitlements")

            let compileArgs: [String] = prefixArgs + [
                "compile",
                inputPath.string,
                "--out", outputDirectory.string,
                "--emit-info-plist",
                "--emit-entitlements",
            ]

            let command = Command.buildCommand(
                displayName: "Compiling TypeScript Intent: \(inputFileName)",
                executable: executablePath,
                arguments: compileArgs,
                environment: [:],
                inputFiles: [inputPath],
                outputFiles: [intentSwift, intentPlist, intentEntitlements]
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

    /// Searches for an executable in PATH
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

/// Errors that can occur in the Axint plugin
enum AxintPluginError: Error, CustomStringConvertible {
    case executableNotFound(String)

    var description: String {
        switch self {
        case .executableNotFound(let message):
            return "Axint Plugin Error: \(message)"
        }
    }
}
