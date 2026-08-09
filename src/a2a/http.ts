import { Command } from "commander";
import { startAxintA2AServer } from "./server.js";

export async function runAxintA2AHttpCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command()
    .name("axint-a2a")
    .description("Run Axint's A2A v1.0 proof and repair server.")
    .option("--host <host>", "Host interface", "127.0.0.1")
    .option("--port <port>", "HTTP port", parsePort, 41_242)
    .option("--public-url <url>", "Public base URL advertised in the Agent Card")
    .option(
      "--project-root <path>",
      "Highest directory A2A tasks may access",
      process.cwd()
    )
    .option("--state-dir <path>", "Durable task and proof artifact directory")
    .option(
      "--allow-unauthenticated",
      "Explicitly allow requests without bearer authentication",
      false
    )
    .parse(argv);

  const values = program.opts<{
    host: string;
    port: number;
    publicUrl?: string;
    projectRoot: string;
    stateDir?: string;
    allowUnauthenticated: boolean;
  }>();
  const running = await startAxintA2AServer({
    host: values.host,
    port: values.port,
    publicUrl: values.publicUrl,
    projectRoot: values.projectRoot,
    stateDirectory: values.stateDir,
    allowUnauthenticated: values.allowUnauthenticated,
  });

  process.stdout.write(
    `Axint A2A server listening at http://${displayHost(running.host)}:${running.port}\n` +
      `Agent Card: http://${displayHost(running.host)}:${running.port}/.well-known/agent-card.json\n`
  );

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await running.close();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Port must be an integer from 1 through 65535.");
  }
  return port;
}

function displayHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}
