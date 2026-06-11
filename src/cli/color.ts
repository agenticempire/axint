/**
 * Central ANSI color policy for the CLI. Color is for humans on TTYs —
 * agents and CI read piped output, which must stay free of escape bytes.
 */

export function shouldUseColor(forceColor = false): boolean {
  if (forceColor) return true;
  if ("NO_COLOR" in process.env) return false;
  return process.stdout.isTTY === true && process.stderr.isTTY === true;
}

export function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
}
