import type { Command } from "commander";
import { handleTokenIngest, type TokenOutputFormat } from "../mcp/tokens.js";

export function registerTokens(program: Command) {
  const tokens = program
    .command("tokens")
    .description("Design token ingestion for SwiftUI generation");

  tokens
    .command("ingest")
    .description("Convert JSON, JS, TS, or CSS design tokens into a SwiftUI token enum")
    .requiredOption("--source <file>", "Design token source file")
    .option("--namespace <name>", "Swift enum namespace", "AxintDesignTokens")
    .option(
      "--format <format>",
      "Output format (swift, json, markdown)",
      (value) => parseTokenFormat(value),
      "swift" as TokenOutputFormat
    )
    .action(
      (options: { source: string; namespace: string; format: TokenOutputFormat }) => {
        try {
          const result = handleTokenIngest({
            sourcePath: options.source,
            namespace: options.namespace,
            format: options.format,
          });
          console.log(result.content[0]?.text ?? "");
        } catch (err: unknown) {
          console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
          process.exit(1);
        }
      }
    );
}

function parseTokenFormat(value: string): TokenOutputFormat {
  if (value === "swift" || value === "json" || value === "markdown") return value;
  throw new Error(`invalid token output format: ${value}`);
}
