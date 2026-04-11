# AxintPlugin

A Swift Package Manager (SPM) Build Tool Plugin that automatically compiles TypeScript `defineIntent()` definitions into native Swift App Intents during your Xcode build process.

## Overview

The Axint compiler transforms TypeScript intent definitions into Swift App Intents code that can be embedded directly in your iOS/macOS applications. This plugin integrates that compilation into your SPM/Xcode build pipeline, so your `.ts` intent files are automatically compiled whenever you build your project.

**Features:**
- Automatic TypeScript → Swift compilation via `swift build`
- Seamless Xcode integration
- Generates `.swift`, `.plist`, and `.entitlements` files
- Minimal configuration required
- Clear error messages if dependencies are missing

## Prerequisites

Before using this plugin, ensure you have:

1. **macOS 13 or later** (for the build tool plugin)
2. **Xcode 15+** (for SPM build tool plugin support)
3. **Node.js 22+** and **npm** (to run the Axint compiler)
4. **@axintai/compiler** package installed

### Installing the Axint Compiler

Install the Axint compiler package in your Swift package or project directory:

```bash
npm install @axintai/compiler
```

Or install it globally:

```bash
npm install -g @axintai/compiler
```

## Integration

### Step 1: Add the Plugin Dependency

In your Swift package's `Package.swift`, add the AxintPlugin as a dependency:

```swift
let package = Package(
    name: "YourPackage",
    platforms: [
        .macOS(.v13),
        .iOS(.v16),
    ],
    products: [
        /* your products */
    ],
    dependencies: [
        .package(
            url: "https://github.com/agenticempire/axint.git",
            branch: "main"
        ),
    ],
    targets: [
        .target(
            name: "YourTarget",
            dependencies: [],
            plugins: [
                .plugin(name: "AxintCompilePlugin", package: "axint")
            ]
        ),
    ]
)
```

Or, if you're working with an Xcode project without SPM, add the plugin via the package dependency UI in Xcode.

### Step 2: Organize Your Intent Files

Place your TypeScript intent definitions in your target's source directory:

```
Sources/YourTarget/
├── MyIntent.ts          # Your TypeScript intent definition
├── AnotherIntent.ts     # Another intent
└── ...other files
```

### Step 3: Build!

Build your project as normal:

```bash
swift build
```

Or in Xcode:
- Press `Cmd+B` to build
- Or use **Product > Build** from the menu

The plugin will:
1. Detect all `.ts` files in your target
2. Run `axint compile` on each file
3. Generate `.swift`, `.plist`, and `.entitlements` files in the build directory
4. Make them available for linking

## Output Files

For each `.ts` intent file, the plugin generates:

- **`{name}.swift`** — Compiled Swift code implementing the App Intent
- **`{name}.ts.plist`** — Info.plist configuration for the intent
- **`{name}.ts.entitlements`** — Entitlements required by the intent

These are generated in the plugin's work directory and automatically included in your build.

## Writing Intent Definitions

Here's an example TypeScript intent definition:

```typescript
// MyIntent.ts
import { defineIntent, param } from "@axintai/compiler";

export const myIntent = defineIntent({
  title: "My Intent",
  description: "An example intent",
  domain: "general",

  params: {
    message: param.string("A message to process"),
  },

  perform({ message }) {
    return `Processed: ${message}`;
  },
});
```

For more details on writing intents, see the [Axint documentation](https://github.com/agenticempire/axint).

## Troubleshooting

### "The 'axint' compiler was not found in your PATH"

**Solution:** Install the Axint compiler:

```bash
npm install -g @axintai/compiler
```

Or, if you prefer not to install globally, install it locally in your project:

```bash
npm install @axintai/compiler
```

The plugin will automatically find it via `npx`.

### Build fails with "TS file not found"

Make sure your `.ts` files are in the correct location within your target's source directory. SPM looks for sources in `Sources/{TargetName}/` by default.

### Generated files are not being picked up

- Ensure your target's `Package.swift` correctly specifies the plugin
- Clean and rebuild: `swift package clean && swift build`
- Check the build log (in Xcode: **Product > Scheme > Edit Scheme > Pre-actions/Build** tab)

### Permission denied when running axint

If you get a permission error:

```bash
# Add execute permissions to the axint binary
chmod +x $(npm bin)/axint
```

## Development

To build and test the plugin locally:

```bash
cd spm-plugin
swift package build
swift test
```

## License

Apache-2.0 — Same as the Axint compiler. See [LICENSE](../LICENSE) in the main Axint repository.

## Resources

- **Axint Repository:** https://github.com/agenticempire/axint
- **Axint Documentation:** https://axint.ai
- **SPM Build Tool Plugins:** https://www.swift.org/documentation/plugins/

## Support

For issues, questions, or contributions:

1. Check the [Axint GitHub Issues](https://github.com/agenticempire/axint/issues)
2. See the [Axint Contributing Guide](../CONTRIBUTING.md)
3. Open a new issue if you find a bug
