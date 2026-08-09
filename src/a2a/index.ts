import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAxintA2AHttpCli } from "./http.js";

export * from "./agent-card.js";
export * from "./auth.js";
export * from "./executor.js";
export * from "./request.js";
export * from "./server.js";
export * from "./service.js";
export * from "./task-store.js";
export * from "./types.js";

function isDirectEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return (
      realpathSync(resolve(fileURLToPath(import.meta.url))) ===
      realpathSync(resolve(entry))
    );
  } catch {
    return false;
  }
}

if (isDirectEntrypoint()) {
  runAxintA2AHttpCli().catch((error: Error) => {
    console.error(`Failed to start Axint A2A server: ${error.message}`);
    process.exit(1);
  });
}
