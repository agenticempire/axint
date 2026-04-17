import type { Command } from "commander";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { hashBundle } from "../core/bundle-hash.js";
import { registryBaseUrl } from "../core/env.js";

export function registerAdd(program: Command, version: string) {
  program
    .command("add")
    .description("Install a template from the Axint Registry")
    .argument(
      "<package>",
      "Template to install (e.g., @axint/create-event or @axint/create-event@1.0.0)"
    )
    .option("--to <dir>", "Target directory", "intents")
    .action(async (pkg: string, options: { to: string }) => {
      console.log();
      console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · add`);
      console.log();

      // Accept both `@namespace/slug` and `namespace/slug` (with optional `@version`).
      // Web URLs drop the leading `@`, so users will copy either form — normalize here.
      const match = pkg.match(/^@?([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:@(.+))?$/);
      if (!match) {
        console.error(
          `  \x1b[31merror:\x1b[0m Invalid package format. Expected: @namespace/slug or namespace/slug (optionally @version)`
        );
        process.exit(1);
      }

      const [, rawNamespace, slug, pkgVersion] = match;
      const namespace = `@${rawNamespace}`;
      const registryUrl = registryBaseUrl();

      console.log(
        `  \x1b[2m⏺\x1b[0m Fetching ${namespace}/${slug}${pkgVersion ? `@${pkgVersion}` : ""}…`
      );

      try {
        const params = new URLSearchParams({ namespace, slug });
        if (pkgVersion) params.set("version", pkgVersion);

        const res = await fetch(`${registryUrl}/api/v1/install?${params}`, {
          headers: { "X-Axint-Version": version },
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({ detail: res.statusText }))) as {
            detail?: string;
          };
          console.error(
            `  \x1b[31m✗\x1b[0m ${err.detail ?? `Template not found (HTTP ${res.status})`}`
          );
          process.exit(1);
        }

        const data = (await res.json()) as {
          namespace: string;
          slug: string;
          version: string;
          ts_source?: string;
          py_source?: string | null;
          swift_output: string;
          plist_fragment?: string | null;
          bundle_hash?: string | null;
        };

        // Refuse to write the bundle if the registry's advertised hash doesn't
        // match what we compute locally. Published-before-hashing bundles
        // return `bundle_hash: null` and skip verification; anything else is a
        // hard fail so tampered bytes never land in the user's repo.
        if (data.bundle_hash) {
          const localHash = await hashBundle({
            ts_source: data.ts_source ?? "",
            py_source: data.py_source ?? null,
            swift_output: data.swift_output,
            plist_fragment: data.plist_fragment ?? null,
          });
          if (localHash !== data.bundle_hash) {
            console.error(
              `  \x1b[31m✗\x1b[0m [AX600] Bundle hash mismatch for ${data.namespace}/${data.slug}@${data.version}`
            );
            console.error(`    expected sha256:${data.bundle_hash}`);
            console.error(`    got      sha256:${localHash}`);
            console.error(
              `    No files written. The registry response does not match its recorded hash.`
            );
            process.exit(1);
          }
        }

        const targetDir = resolve(options.to, slug);
        mkdirSync(targetDir, { recursive: true });

        const filesWritten: string[] = [];

        if (data.ts_source) {
          writeFileSync(resolve(targetDir, "intent.ts"), data.ts_source, "utf-8");
          filesWritten.push("intent.ts");
        }
        if (data.py_source) {
          writeFileSync(resolve(targetDir, "intent.py"), data.py_source, "utf-8");
          filesWritten.push("intent.py");
        }
        writeFileSync(resolve(targetDir, "intent.swift"), data.swift_output, "utf-8");
        filesWritten.push("intent.swift");

        console.log(
          `  \x1b[32m✓\x1b[0m Installed ${data.namespace}/${data.slug}@${data.version}`
        );
        console.log(`    → ${targetDir}/`);
        filesWritten.forEach((f) => console.log(`      ${f}`));
        if (data.bundle_hash) {
          console.log(
            `    \x1b[2mverified sha256:${data.bundle_hash.slice(0, 12)}…\x1b[0m`
          );
        }
        console.log();
        console.log(`  \x1b[1mNext:\x1b[0m`);
        console.log(
          `    axint compile ${options.to}/${slug}/intent.ts --out ios/Intents/`
        );
        console.log();
      } catch (err: unknown) {
        console.error(`  \x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    });
}
