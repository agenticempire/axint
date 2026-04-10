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

        // Find the axint executable
        let axintPath = try findAxintExecutable()

        var commands: [Command] = []

        // Scan for TypeScript files in the target
        let tsFiles = sourceTarget.sourceFiles.filter { sourceFile in
            sourceFile.path.string.hasSuffix(".ts") && !sourceFile.path.string.hasSuffix(".d.ts")
        }

        for sourceFile in tsFiles {
            let inputPath = sourceFile.path
            let outputDirectory = context.pluginWorkDirectory.appending("compiled")

            // Create the output directory structure
            try FileManager.default.createDirectory(
                at: outputDirectory.asURL,
                withIntermediateDirectories: true,
                attributes: nil
            )

            // Generate output filename (e.g., "intent.ts" -> "intent.swift")
            let inputFileName = inputPath.lastComponent
            let outputFileName = inputFileName.replacingOccurrences(of: ".ts", with: ".swift")
            let outputPath = outputDirectory.appending(outputFileName)

            // Create the build command
            let command = Command.buildCommand(
                displayName: "Compiling TypeScript Intent: \(inputFileName)",
                executable: axintPath,
                arguments: [
                    "compile",
                    inputPath.string,
                    "--out", outputDirectory.string,
                    "--json",
                    "--emit-info-plist",
                    "--emit-entitlements",
                ],
                environment: [:],
                inputFiles: [inputPath],
                outputFiles: [
                    outputPath,
                    outputDirectory.appending("\(inputFileName).plist"),
                    outputDirectory.appending("\(inputFileName).entitlements"),
                ]
            )

            commands.append(command)
        }

        return commands
    }

    /// Attempts to find the axint executable in the environment.
    /// First tries to find it via npx, then checks PATH.
    private func findAxintExecutable() throws -> Path {
        // Try npx first (for npm package @axintai/compiler)
        if let npxPath = try findInPath("npx") {
            // We'll return a custom executor that wraps npx
            return npxPath
        }

        // Try finding axint directly in PATH
        if let axintPath = try findInPath("axint") {
            return axintPath
        }

        // If not found, throw an error with helpful instructions
        throw AxintPluginError.executableNotFound(
            """
            The 'axint' compiler was not found in your PATH.

            Please install it by running:
              npm install -g @axintai/compiler

            Or, if you prefer to use npx directly (no global install):
              1. Ensure Node.js and npm are installed
              2. Run: npm install @axintai/compiler (in your project root)
              3. The plugin will use npx to invoke the compiler

            For more information, visit: https://github.com/agenticempire/axint
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
