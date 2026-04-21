import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AxintCredentials {
  access_token: string;
  registry: string;
}

export interface AxintLoginState {
  signedIn: boolean;
  registry?: string;
}

export function resolveCredentialsPath(home: string = homedir()): string {
  return join(home, ".axint", "credentials.json");
}

export function loadAxintCredentials(home: string = homedir()): AxintCredentials | null {
  const credPath = resolveCredentialsPath(home);
  if (!existsSync(credPath)) return null;

  try {
    const parsed = JSON.parse(
      readFileSync(credPath, "utf-8")
    ) as Partial<AxintCredentials>;
    if (
      typeof parsed.access_token === "string" &&
      parsed.access_token.length > 0 &&
      typeof parsed.registry === "string" &&
      parsed.registry.length > 0
    ) {
      return {
        access_token: parsed.access_token,
        registry: parsed.registry,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function getAxintLoginState(home: string = homedir()): AxintLoginState {
  const creds = loadAxintCredentials(home);
  if (!creds) {
    return { signedIn: false };
  }

  return {
    signedIn: true,
    registry: creds.registry,
  };
}
