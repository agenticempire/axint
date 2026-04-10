/**
 * Project scaffolder — `axint init`
 *
 * Zero-config project creation. Drops a working Axint project on disk:
 *
 *   my-app/
 *   ├── package.json          — pinned to the current Axint version
 *   ├── tsconfig.json         — strict, ES2022, module NodeNext
 *   ├── .gitignore
 *   ├── README.md             — next-steps guide
 *   ├── intents/
 *   │   └── <template>.ts     — starter intent from the template library
 *   ├── ios/
 *   │   └── Intents/          — compile output target (created on first run)
 *   └── .vscode/
 *       └── mcp.json          — ready-to-use MCP server config for Cursor/Copilot
 *
 * The scaffolder is deliberately dependency-free at runtime — everything is
 * written with `fs/promises`. It is safe to call against an existing directory
 * as long as that directory is empty (or only contains a .git folder).
 */

import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import { getTemplate } from "../templates/index.js";

export interface ScaffoldOptions {
  targetDir: string;
  projectName: string;
  template: string;
  version: string;
  install: boolean;
}

export interface ScaffoldResult {
  files: string[];
  entryFile: string;
}

export async function scaffoldProject(opts: ScaffoldOptions): Promise<ScaffoldResult> {
  const { targetDir, projectName, template, version, install } = opts;

  // 1. Resolve template
  const tpl = getTemplate(template);
  if (!tpl) {
    throw new Error(
      `Unknown template "${template}". Run \`axint templates\` to see available templates.`
    );
  }

  // 2. Safety check — refuse to overwrite a populated directory
  if (existsSync(targetDir)) {
    const entries = await readdir(targetDir).catch(() => []);
    const populated = entries.filter((e) => !e.startsWith(".git") && e !== ".DS_Store");
    if (populated.length > 0) {
      throw new Error(
        `Directory "${targetDir}" is not empty. Pick an empty folder or use \`axint init my-new-app\`.`
      );
    }
  } else {
    await mkdir(targetDir, { recursive: true });
  }

  const files: string[] = [];
  const write = async (rel: string, content: string) => {
    const abs = join(targetDir, rel);
    await mkdir(join(abs, "..").replace(/[/\\][^/\\]+$/, ""), { recursive: true }).catch(
      () => undefined
    );
    // Ensure parent dir exists using a more reliable approach
    const parent = abs.substring(
      0,
      abs.lastIndexOf("/") === -1 ? abs.lastIndexOf("\\") : abs.lastIndexOf("/")
    );
    if (parent && parent !== abs) {
      await mkdir(parent, { recursive: true }).catch(() => undefined);
    }
    await writeFile(abs, content, "utf-8");
    files.push(relative(targetDir, abs));
  };

  // 3. package.json
  await write(
    "package.json",
    JSON.stringify(
      {
        name: projectName,
        version: "0.0.1",
        private: true,
        type: "module",
        scripts: {
          compile: `axint compile intents/${template}.ts --out ios/Intents/`,
          "compile:plist": `axint compile intents/${template}.ts --out ios/Intents/ --emit-info-plist --emit-entitlements`,
          validate: `axint validate intents/${template}.ts`,
          sandbox: `axint validate intents/${template}.ts --sandbox`,
        },
        dependencies: {
          "@axintai/compiler": `^${version}`,
        },
      },
      null,
      2
    ) + "\n"
  );

  // 4. tsconfig.json
  await write(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
          isolatedModules: true,
          verbatimModuleSyntax: false,
          resolveJsonModule: true,
        },
        include: ["intents/**/*.ts"],
      },
      null,
      2
    ) + "\n"
  );

  // 5. .gitignore
  await write(
    ".gitignore",
    ["node_modules", "dist", ".DS_Store", ".axint-sandbox", "*.log", ""].join("\n")
  );

  // 6. The starter intent itself — pulled straight from the template library
  //    but with the `axint` import swapped to `@axintai/compiler/sdk` so it
  //    resolves against the scaffolded dependency.
  const intentSource = tpl.source.replace(
    /from "axint"/g,
    `from "@axintai/compiler/sdk"`
  );
  await write(`intents/${template}.ts`, intentSource);

  // 7. .vscode/mcp.json — ready to `npx axint-mcp` from Cursor/Claude Code
  await write(
    ".vscode/mcp.json",
    JSON.stringify(
      {
        mcpServers: {
          axint: {
            command: "npx",
            args: ["-y", "@axintai/compiler", "axint-mcp"],
          },
        },
      },
      null,
      2
    ) + "\n"
  );

  // 8. Project README
  await write("README.md", scaffoldReadme(projectName, template, tpl.title, version));

  // 9. ios/Intents — create target dir so `compile` has somewhere to land
  await mkdir(join(targetDir, "ios", "Intents"), { recursive: true });
  await write("ios/Intents/.gitkeep", "");

  // 10. Optional npm install
  if (install) {
    await runNpmInstall(targetDir);
  }

  return {
    files,
    entryFile: `${template}.ts`,
  };
}

function scaffoldReadme(
  name: string,
  template: string,
  title: string,
  version: string
): string {
  return `# ${name}

An [Axint](https://axint.ai) project — write App Intents in TypeScript, ship them to Siri.

Generated from the **${title}** template, pinned to \`@axintai/compiler@^${version}\`.

## Compile it

\`\`\`bash
npm install
npm run compile
\`\`\`

Output lands in \`ios/Intents/\`. Drag that folder into your Xcode target and you're done.

## Validate it

\`\`\`bash
npm run validate              # fast IR + Swift lint
npm run sandbox               # stage 4: swift build in an SPM sandbox (macOS only)
\`\`\`

## Use with AI coding tools

The \`.vscode/mcp.json\` file is pre-wired for Cursor, Claude Code, and Windsurf.
Any agent that supports MCP can now call \`axint_compile\`, \`axint_validate\`,
\`axint_scaffold\`, and \`axint_template\` against this project.

## Next

- Edit \`intents/${template}.ts\` — this is your App Intent source of truth.
- Add more intents in the \`intents/\` folder.
- Run \`axint templates\` to see every bundled starter.
- Read the docs at https://axint.ai/docs

---

_Generated by \`axint init\`_
`;
}

function runNpmInstall(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["install"], { cwd, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
