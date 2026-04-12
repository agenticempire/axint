import type { Command } from "commander";

export function registerSearch(program: Command, version: string) {
  program
    .command("search")
    .description("Search the Axint Registry for intent templates")
    .argument("[query]", "Search term (lists popular packages if omitted)")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action(
      async (query: string | undefined, options: { limit: string; json: boolean }) => {
        const registryUrl = process.env.AXINT_REGISTRY_URL ?? "https://registry.axint.ai";
        const limit = Math.max(1, Math.min(100, parseInt(options.limit, 10) || 20));

        console.log();
        if (!options.json) {
          console.log(
            `  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · search ${query ? `"${query}"` : ""}`
          );
          console.log();
        }

        try {
          const params = new URLSearchParams({ limit: String(limit) });
          if (query) params.set("q", query);

          const res = await fetch(`${registryUrl}/api/v1/search?${params}`, {
            headers: { "X-Axint-Version": version },
          });

          if (!res.ok) {
            console.error(`\x1b[31merror:\x1b[0m Search failed (HTTP ${res.status})`);
            process.exit(1);
          }

          const data = (await res.json()) as {
            results: {
              package_name: string;
              name: string;
              description: string;
              downloads: number;
            }[];
            total: number;
          };

          if (options.json) {
            console.log(JSON.stringify(data, null, 2));
            return;
          }

          if (data.results.length === 0) {
            console.log(`  No packages found`);
            console.log();
            return;
          }

          for (const pkg of data.results) {
            const downloads = pkg.downloads > 0 ? `▼ ${pkg.downloads}` : "";
            const dl = downloads ? `  \x1b[2m${downloads}\x1b[0m` : "";
            console.log(
              `  \x1b[38;5;208m◆\x1b[0m ${pkg.package_name.padEnd(30)} ${pkg.description.substring(0, 35).padEnd(35)}${dl}`
            );
          }
          console.log();
          console.log(
            `  ${data.results.length} package${data.results.length === 1 ? "" : "s"} found`
          );
          console.log();
          console.log(
            `  \x1b[2mInstall:\x1b[0m axint add ${data.results[0]?.package_name ?? "@namespace/slug"}`
          );
          console.log();
        } catch (err: unknown) {
          console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
          process.exit(1);
        }
      }
    );
}
