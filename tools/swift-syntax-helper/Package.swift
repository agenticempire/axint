// swift-tools-version:5.9
//
// Axint Syntax Helper — a tiny Swift executable that parses Swift source
// with apple/swift-syntax and emits Axint diagnostics as JSON on stdout.
//
// The TypeScript validator shells out to this binary for rules that need
// a real AST (nested types, comment-aware parsing, multi-line declarations).
// Regex stays in charge of everything the AST doesn't improve on.
//
// Build:
//   cd tools/swift-syntax-helper && swift build -c release
//
// The release binary lands at .build/release/axint-syntax and is roughly
// 4MB on Apple Silicon — small enough to ship inside the npm package for
// macOS users, with a graceful fallback to regex on Linux/Windows.

import PackageDescription

let package = Package(
    name: "axint-syntax",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "axint-syntax", targets: ["AxintSyntax"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-syntax.git", from: "600.0.0")
    ],
    targets: [
        .executableTarget(
            name: "AxintSyntax",
            dependencies: [
                .product(name: "SwiftSyntax", package: "swift-syntax"),
                .product(name: "SwiftParser", package: "swift-syntax")
            ],
            path: "Sources/AxintSyntax"
        )
    ]
)
