import type { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { compileFile } from "../core/compiler.js";
import { hashBundle } from "../core/bundle-hash.js";
import { loadAxintCredentials, resolveCredentialsPath } from "../core/credentials.js";
import { registryBaseUrl } from "../core/env.js";
import { loadAxintConfig } from "../core/axint-config.js";

export function registerPublish(program: Command, version: string) {
  program
    .command("publish")
    .description("Publish an intent to the Axint Registry")
    .option("--dry-run", "Validate and show what would be published without uploading")
    .option("--tag <tags...>", "Override tags")
    .action(async (options: { dryRun?: boolean; tag?: string[] }) => {
      const cwd = process.cwd();

      console.log();
      console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · publish`);
      console.log();

      const loaded = await loadAxintConfig(cwd);
      if (!loaded.ok) {
        if (loaded.reason === "missing") {
          console.error(`  \x1b[31merror:\x1b[0m No axint.json found in ${cwd}`);
          console.error(`  \x1b[2mRun \`axint init\` to create one.\x1b[0m`);
        } else if (loaded.reason === "parse") {
          console.error(`  \x1b[31merror:\x1b[0m axint.json is not valid JSON`);
          console.error(`  \x1b[2m${loaded.parseError}\x1b[0m`);
        } else {
          console.error(`  \x1b[31merror:\x1b[0m axint.json does not match the schema`);
          for (const issue of loaded.issues ?? []) {
            const location = issue.path
              ? `  \x1b[31m✗\x1b[0m ${issue.path}: `
              : `  \x1b[31m✗\x1b[0m `;
            console.error(`${location}${issue.message}`);
          }
          console.error(
            `  \x1b[2mSchema: https://docs.axint.ai/schema/axint.json\x1b[0m`
          );
        }
        process.exit(1);
      }

      const config = loaded.config;
      const entryFile = config.entry;
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
      // Schema enforces a leading @ — validate already rejected it otherwise.
      const namespace = config.namespace;

      const tsSource = readFileSync(entryPath, "utf-8");
      const plistFragment = result.output.infoPlistFragment ?? null;

      // Hash the exact bytes the registry will return at install time so the
      // server can verify we agree on what was published. `axint add` re-runs
      // the same computation on fetch — any drift aborts before writing files.
      const bundleHash = await hashBundle({
        ts_source: tsSource,
        py_source: pySource ?? null,
        swift_output: result.output.swiftCode,
        plist_fragment: plistFragment,
      });

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
        ts_source: tsSource,
        py_source: pySource,
        swift_output: result.output.swiftCode,
        plist_fragment: plistFragment,
        ir: result.output.ir ?? {},
        compiler_version: version,
        bundle_hash: bundleHash,
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
        console.log(`  Bundle hash:   sha256:${bundleHash}`);
        console.log(`  Tags:          ${tags.join(", ") || "(none)"}`);
        console.log();
        return;
      }

      const credPath = resolveCredentialsPath();

      if (!existsSync(credPath)) {
        console.error(
          `  \x1b[31merror:\x1b[0m Not logged in. Run \`axint login\` first.`
        );
        process.exit(1);
      }

      const creds = loadAxintCredentials();
      if (!creds) {
        console.error(
          `  \x1b[31merror:\x1b[0m Corrupt credentials file. Run \`axint login\` again.`
        );
        process.exit(1);
      }

      const registryUrl = creds.registry ?? registryBaseUrl();

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
          // Server uses `{error: string}` — see axint-registry/packages/api/src/index.ts.
          const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
            error?: string;
          };
          console.error(
            `  \x1b[31m✗\x1b[0m Publish failed: ${err.error ?? res.statusText}`
          );
          process.exit(1);
        }

        const data = (await res.json()) as { url: string; bundle_hash?: string };

        if (data.bundle_hash && data.bundle_hash !== bundleHash) {
          console.error(
            `  \x1b[31m✗\x1b[0m Registry recorded a different bundle hash (client ${bundleHash} vs server ${data.bundle_hash}). Publish rejected for your safety.`
          );
          process.exit(1);
        }

        console.log(`  \x1b[32m✓\x1b[0m Published!`);
        console.log();
        console.log(`    ${data.url}`);
        console.log();
        console.log(`  \x1b[2mBundle hash: sha256:${bundleHash}\x1b[0m`);
        console.log(`  \x1b[2mInstall: axint add ${namespace}/${config.slug}\x1b[0m`);
        console.log();
      } catch (err: unknown) {
        console.error(`  \x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    });
}
