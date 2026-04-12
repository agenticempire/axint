import type { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { compileFile } from "../core/compiler.js";

export function registerPublish(program: Command, version: string) {
  program
    .command("publish")
    .description("Publish an intent to the Axint Registry")
    .option("--dry-run", "Validate and show what would be published without uploading")
    .option("--tag <tags...>", "Override tags")
    .action(async (options: { dryRun?: boolean; tag?: string[] }) => {
      const cwd = process.cwd();
      const configPath = resolve(cwd, "axint.json");

      console.log();
      console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · publish`);
      console.log();

      if (!existsSync(configPath)) {
        console.error(`  \x1b[31merror:\x1b[0m No axint.json found in ${cwd}`);
        console.error(`  \x1b[2mRun \`axint init\` to create one.\x1b[0m`);
        process.exit(1);
      }

      let config: {
        name: string;
        namespace: string;
        slug: string;
        version: string;
        description?: string;
        primary_language?: string;
        surface_areas?: string[];
        tags?: string[];
        license?: string;
        homepage?: string;
        repository?: string;
        entry?: string;
        readme?: string;
        siri_phrases?: string[];
        permissions?: string[];
      };

      try {
        config = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {
        console.error(`  \x1b[31merror:\x1b[0m Failed to parse axint.json`);
        process.exit(1);
      }

      const entryFile = config.entry ?? "intent.ts";
      const entryPath = resolve(cwd, entryFile);

      if (!existsSync(entryPath)) {
        console.error(`  \x1b[31merror:\x1b[0m Entry file not found: ${entryFile}`);
        process.exit(1);
      }

      console.log(`  \x1b[2m⏺\x1b[0m Compiling ${entryFile}…`);

      let result: Awaited<ReturnType<typeof compileFile>>;
      try {
        result = await compileFile(entryPath, {});
      } catch (err: unknown) {
        console.error(`  \x1b[31m✗\x1b[0m Compilation failed: ${(err as Error).message}`);
        process.exit(1);
      }

      if (!result.success || !result.output) {
        console.error(`  \x1b[31m✗\x1b[0m Compilation failed`);
        for (const d of result.diagnostics) {
          console.error(`    [${d.code}] ${d.message}`);
        }
        process.exit(1);
      }

      console.log(
        `  \x1b[32m✓\x1b[0m Compiled → ${result.output.swiftCode.split("\n").length} lines of Swift`
      );

      let readme: string | undefined;
      const readmePath = resolve(cwd, config.readme ?? "README.md");
      if (existsSync(readmePath)) {
        readme = readFileSync(readmePath, "utf-8");
      }

      let pySource: string | undefined;
      const pyPath = resolve(cwd, entryFile.replace(/\.ts$/, ".py"));
      if (existsSync(pyPath)) {
        pySource = readFileSync(pyPath, "utf-8");
      }

      const tags = options.tag ?? config.tags ?? [];
      const namespace = config.namespace.startsWith("@")
        ? config.namespace
        : `@${config.namespace}`;

      const payload = {
        namespace,
        slug: config.slug,
        name: config.name,
        version: config.version,
        description: config.description,
        readme,
        primary_language: config.primary_language ?? (pySource ? "both" : "typescript"),
        surface_areas: config.surface_areas ?? [],
        tags,
        license: config.license ?? "Apache-2.0",
        homepage: config.homepage,
        repository: config.repository,
        ts_source: readFileSync(entryPath, "utf-8"),
        py_source: pySource,
        swift_output: result.output.swiftCode,
        plist_fragment: result.output.infoPlistFragment ?? null,
        ir: result.output.ir ?? {},
        compiler_version: version,
      };

      if (options.dryRun) {
        console.log(`  \x1b[32m✓\x1b[0m Validation passed`);
        console.log();
        console.log(
          `  Would publish: \x1b[1m${namespace}/${config.slug}@${config.version}\x1b[0m`
        );
        console.log(
          `  Bundle size:   ${Buffer.from(JSON.stringify(payload)).byteLength} bytes`
        );
        console.log(`  Tags:          ${tags.join(", ") || "(none)"}`);
        console.log();
        return;
      }

      const { homedir } = await import("node:os");
      const { join } = await import("node:path");
      const credPath = join(homedir(), ".axint", "credentials.json");

      if (!existsSync(credPath)) {
        console.error(
          `  \x1b[31merror:\x1b[0m Not logged in. Run \`axint login\` first.`
        );
        process.exit(1);
      }

      let creds: { access_token: string; registry: string };
      try {
        creds = JSON.parse(readFileSync(credPath, "utf-8"));
      } catch {
        console.error(
          `  \x1b[31merror:\x1b[0m Corrupt credentials file. Run \`axint login\` again.`
        );
        process.exit(1);
      }

      const registryUrl = creds.registry ?? "https://registry.axint.ai";

      console.log(`  \x1b[2m⏺\x1b[0m Publishing to ${registryUrl}…`);

      try {
        const res = await fetch(`${registryUrl}/api/v1/publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${creds.access_token}`,
            "X-Axint-Version": version,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({ detail: res.statusText }))) as {
            detail?: string;
            title?: string;
          };
          console.error(
            `  \x1b[31m✗\x1b[0m ${err.title ?? "Publish failed"}: ${err.detail ?? res.statusText}`
          );
          process.exit(1);
        }

        const data = (await res.json()) as { url: string };

        console.log(`  \x1b[32m✓\x1b[0m Published!`);
        console.log();
        console.log(`    ${data.url}`);
        console.log();
        console.log(`  \x1b[2mInstall: axint add ${namespace}/${config.slug}\x1b[0m`);
        console.log();
      } catch (err: unknown) {
        console.error(`  \x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    });
}
