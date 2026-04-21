import type { Command } from "commander";
import { writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { registryBaseUrl } from "../core/env.js";

export function registerLogin(program: Command) {
  program
    .command("login")
    .description(
      "Authenticate with the Axint Registry via GitHub to unlock publish, richer terminal reports, and hosted Axint features"
    )
    .action(async () => {
      const { homedir } = await import("node:os");
      const { join } = await import("node:path");

      const configDir = join(homedir(), ".axint");
      const credPath = join(configDir, "credentials.json");
      const registryUrl = registryBaseUrl();

      console.log();
      console.log(`  \x1b[38;5;208m◆\x1b[0m \x1b[1mAxint\x1b[0m · login`);
      console.log();
      console.log(
        "  Sign in once to unlock richer terminal reports, `axint publish`, and hosted Axint features when available."
      );
      console.log();

      try {
        const res = await fetch(`${registryUrl}/api/v1/auth/device-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: "axint-cli" }),
        });

        if (!res.ok) {
          console.error(
            `\x1b[31merror:\x1b[0m Failed to start login flow (HTTP ${res.status})`
          );
          process.exit(1);
        }

        const { device_code, user_code, verification_uri, interval } =
          (await res.json()) as {
            device_code: string;
            user_code: string;
            verification_uri: string;
            interval: number;
          };

        console.log(`  Open this URL in your browser:`);
        console.log();
        console.log(`    \x1b[1;4m${verification_uri}\x1b[0m`);
        console.log();
        console.log(`  And enter this code: \x1b[1;38;5;208m${user_code}\x1b[0m`);
        console.log();
        console.log(`  \x1b[2mWaiting for authorization…\x1b[0m`);

        try {
          const openCmd =
            process.platform === "darwin"
              ? "open"
              : process.platform === "win32"
                ? "start"
                : "xdg-open";
          spawn(openCmd, [verification_uri], { stdio: "ignore", detached: true }).unref();
        } catch {
          // non-blocking — user can open the URL manually
        }

        const pollInterval = (interval ?? 5) * 1000;
        let token: string | null = null;

        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, pollInterval));

          const pollRes = await fetch(`${registryUrl}/api/v1/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_code, grant_type: "device_code" }),
          });

          if (pollRes.ok) {
            const data = (await pollRes.json()) as { access_token: string };
            token = data.access_token;
            break;
          }

          const err = (await pollRes.json()) as { error?: string };
          if (err.error === "authorization_pending") continue;
          if (err.error === "slow_down") {
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          if (err.error === "expired_token") {
            console.error(
              `\x1b[31merror:\x1b[0m Login timed out. Run \`axint login\` again.`
            );
            process.exit(1);
          }
          console.error(`\x1b[31merror:\x1b[0m ${err.error ?? "Unknown error"}`);
          process.exit(1);
        }

        if (!token) {
          console.error(`\x1b[31merror:\x1b[0m Login timed out after 5 minutes.`);
          process.exit(1);
        }

        mkdirSync(configDir, { recursive: true });
        writeFileSync(
          credPath,
          JSON.stringify({ access_token: token, registry: registryUrl }, null, 2),
          "utf-8"
        );

        console.log(
          `  \x1b[32m✓\x1b[0m Logged in! Credentials saved to \x1b[2m${credPath}\x1b[0m`
        );
        console.log(
          "  Future Axint checks will show the richer signed-in terminal report."
        );
        console.log();
      } catch (err: unknown) {
        console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    });
}
