/**
 * Canonical hash over the bytes that leave the registry at install time.
 *
 * The registry stores this hash on publish and returns it on install so
 * `axint add` can verify the bundle wasn't altered between the two
 * endpoints. We canonicalize on the TS side, the server side (Workers
 * runtime), and anywhere else a bundle round-trips — if any of those
 * three disagree on bytes, the hash diverges and we catch it before the
 * files hit the user's disk.
 *
 * The contract:
 *   • UTF-8 JSON, keys in alphabetical order, no whitespace
 *   • Missing optional fields are explicit `null`, never `undefined`
 *   • SHA-256, lower-case hex, 64 chars
 */

export interface BundleContents {
  ts_source?: string | null;
  py_source?: string | null;
  swift_output: string;
  plist_fragment?: string | null;
}

export function canonicalizeBundle(bundle: BundleContents): string {
  const normalized = {
    plist_fragment: bundle.plist_fragment ?? null,
    py_source: bundle.py_source ?? null,
    swift_output: bundle.swift_output,
    ts_source: bundle.ts_source ?? null,
  };
  return JSON.stringify(normalized);
}

export async function hashBundle(bundle: BundleContents): Promise<string> {
  const canonical = canonicalizeBundle(bundle);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
}

export const BUNDLE_HASH_ALGORITHM = "sha256" as const;
export const BUNDLE_HASH_HEX_LENGTH = 64;
