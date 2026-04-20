# AxintPlugin

A Swift Package Manager (SPM) and Xcode Build Tool Plugin that automatically compiles TypeScript definitions into native Swift code during your build process.

## Overview

The Axint compiler transforms TypeScript definitions into native Swift code that can be embedded directly in your iOS/macOS applications. This plugin integrates that compilation into your SPM and Xcode build pipelines, so your `.ts` files are automatically compiled whenever you build your project.

TypeScript files can contain `defineIntent()`, `defineView()`, `defineWidget()`, or `defineApp()` definitions — the plugin handles all Axint surfaces.

**Features:**
- Automatic TypeScript → Swift compilation via `swift build`
- Works in SPM projects and Xcode projects (with or without SPM)
- Generates `.swift`, `.plist.fragment.xml`, and `.entitlements.fragment.xml` files
- Emits a per-file Fix Packet (`latest.json` and `latest.md`) for AI/Xcode repair loops
- Supports all Axint surfaces (intents, views, widgets, apps)
- Minimal configuration required
- Clear error messages if dependencies are missing

## Prerequisites

Before using this plugin, ensure you have:

1. **macOS 13 or later** (for the build tool plugin)
2. **Xcode 15+** (for SPM build tool plugin support)
3. **Node.js 22+** and **npm** (to run the Axint compiler)
4. **@axint/compiler** package installed

### Installing the Axint Compiler

Install the Axint compiler package in your Swift package or project directory:

```bash
npm install @axint/compiler
```

Or install it globally:

```bash
npm install -g @axint/compiler
```

## Integration

### SPM Projects

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

### Xcode Projects (non-SPM)

The plugin also supports Xcode projects that don't use SPM. Add the package via Xcode's package dependency UI:

1. In Xcode, select your project
2. Go to **Build Phases** for your target
3. Add `AxintCompilePlugin` (and optionally `AxintValidatePlugin`) as build tool plugin dependencies
4. The plugin will automatically compile `.ts` files during build

### Organize Your Files

Place your TypeScript definitions in your target's source directory:

```
Sources/YourTarget/
├── MyIntent.ts          # defineIntent() definition
├── UserView.ts          # defineView() definition
├── HealthWidget.ts      # defineWidget() definition
├── MyApp.ts             # defineApp() definition
└── ...other files
```

### Build

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
3. Generate `.swift`, `.plist.fragment.xml`, and `.entitlements.fragment.xml` files in the build directory
4. Emit a per-file Fix Packet with the exact next-step prompt and repair metadata
5. Make the generated Swift available for linking

## Output Files

For each `.ts` intent file, the plugin generates:

- **`{Name}Intent.swift`** — Compiled Swift code implementing the App Intent
- **`{Name}Intent.plist.fragment.xml`** — Info.plist configuration for the intent
- **`{Name}Intent.entitlements.fragment.xml`** — Entitlements required by the intent

These are generated in the plugin's work directory and automatically included in your build.

## Fix Packet Flow

Every `.ts` file compiled by `AxintCompilePlugin` now also writes a Fix Packet into the
plugin work directory:

- `fix/<file-name>/latest.json`
- `fix/<file-name>/latest.md`

That packet is the handoff contract for AI tools and Xcode helpers:

- `latest.json` is the structured machine-readable artifact
- `latest.md` is the human-readable repair summary

The intended loop is:

1. Build in Xcode or run `swift build`
2. Let Axint compile the TypeScript surface
3. Read the Fix Packet for the file that failed or needs review
4. Hand the prompt/checklist back to your AI tool or use it directly in Xcode
5. Rebuild after the fix

This keeps the compiler output simple for humans while still giving AI tooling the full repair packet.

`AxintValidatePlugin` uses the same contract for Swift validation runs. When the validator
finds AX7xx issues, it writes a target-level Fix Packet under `fix/validate/` so Xcode or
an AI helper can read the repair checklist instead of only relying on raw console output.

## Writing Definitions

Here's an example TypeScript intent definition:

```typescript
// MyIntent.ts
import { defineIntent, param } from "@axint/compiler";

export const myIntent = defineIntent({
  name: "MyIntent",
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

You can also define views, widgets, and apps using `defineView()`, `defineWidget()`, and `defineApp()` respectively. For more details, see the [Axint documentation](https://github.com/agenticempire/axint).

## Troubleshooting

### "The 'axint' compiler was not found in your PATH"

**Solution:** Install the Axint compiler:

```bash
npm install -g @axint/compiler
```

Or, if you prefer not to install globally, install it locally in your project:

```bash
npm install @axint/compiler
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
