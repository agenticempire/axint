// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AxintPlugin",
    platforms: [
        .macOS(.v13),
        .iOS(.v16),
    ],
    products: [
        .plugin(
            name: "AxintCompilePlugin",
            targets: ["AxintCompilePlugin"]
        ),
    ],
    targets: [
        .plugin(
            name: "AxintCompilePlugin",
            capability: .buildTool(),
            path: "Plugins/AxintCompilePlugin"
        ),
    ]
)
