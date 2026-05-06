import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAxintServer as createAxintServerImpl, startMCPServer } from "./server.js";

export function createAxintServer(): unknown {
  return createAxintServerImpl();
}

export { startMCPServer };
export {
  TOOL_MANIFEST,
  compactToolManifest,
  getRuntimeToolManifest,
} from "./manifest.js";
export { PROMPT_MANIFEST, getPromptMessages } from "./prompts.js";

function isDirectEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;

  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(entry);
  } catch {
    return false;
  }
}

if (isDirectEntrypoint()) {
  startMCPServer().catch((err: Error) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  });
}
