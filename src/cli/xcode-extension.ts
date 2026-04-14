/**
 * `axint xcode extension install` and `axint xcode extension status`
 *
 * Downloads the latest notarized AxintForXcode.app from the
 * agenticempire/axint GitHub release, drops it into ~/Applications, and
 * walks the user through enabling it in System Settings → Extensions →
 * Xcode Source Editor.
 */

import { existsSync, mkdirSync, rmSync, createWriteStream, statSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

const REPO = "agenticempire/axint";
const APP_NAME = "AxintForXcode.app";
const BUNDLE_ID = "com.axint.xcode-extension";

export async function installXcodeExtension(
  options: { force?: boolean; dir?: string } = {}
): Promise<void> {
  if (platform() !== "darwin") {
    exit("The Axint Xcode extension is macOS-only.");
  }

  const installDir = options.dir ?? join(homedir(), "Applications");
  ensureDir(installDir);

  const target = join(installDir, APP_NAME);
  if (existsSync(target) && !options.force) {
    info(`${APP_NAME} is already installed at ${target}`);
    info("Re-run with --force to replace it with the latest release.");
    await openExtensionsSettings();
    return;
  }

  const release = await fetchLatestRelease();
  const asset = release.assets.find(
    (a) => a.name === "AxintForXcode.zip" || a.name.endsWith(".zip")
  );
  if (!asset) {
    exit(
      `No AxintForXcode.zip asset on release ${release.tag_name}. Tag one with xcode-ext-v* to trigger the workflow.`
    );
  }

  info(`Downloading ${asset.name} from ${release.tag_name}`);
  const zipPath = join(tmpdir(), `axint-xcode-${Date.now()}.zip`);
  await download(asset.browser_download_url, zipPath);

  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  info(`Unpacking to ${installDir}`);
  await run("ditto", ["-x", "-k", zipPath, installDir]);
  rmSync(zipPath, { force: true });

  await run("open", ["-a", target]);
  info(`Launched ${APP_NAME} once so macOS registers the extension.`);

  await openExtensionsSettings();

  done(
    `Installed ${APP_NAME} to ${target}.\n` +
      `→ In System Settings → Extensions → Xcode Source Editor, toggle Axint on.\n` +
      `→ Relaunch Xcode. The commands appear under Editor → Axint.`
  );
}

export async function xcodeExtensionStatus(): Promise<void> {
  if (platform() !== "darwin") {
    info("Xcode extension status is only meaningful on macOS.");
    return;
  }

  const candidates = [
    join(homedir(), "Applications", APP_NAME),
    join("/Applications", APP_NAME),
  ];
  const found = candidates.find((p) => existsSync(p));

  if (!found) {
    info(`${APP_NAME} is not installed.`);
    info("Run `axint xcode extension install` to fetch the latest release.");
    return;
  }

  const version = await readInfoPlistVersion(found);
  info(`${APP_NAME} is installed at ${found}${version ? ` (v${version})` : ""}`);
  info(`Bundle ID: ${BUNDLE_ID}`);
  info("Enable in System Settings → Extensions → Xcode Source Editor.");
}

// ─── GitHub release ──────────────────────────────────────────────────

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}
interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

async function fetchLatestRelease(): Promise<Release> {
  // Filter to xcode-ext-v* tags — the main repo also cuts compiler releases.
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
    headers: { "User-Agent": "axint-cli" },
  });
  if (!res.ok) exit(`GitHub API ${res.status}: ${await res.text()}`);
  const all = (await res.json()) as Release[];
  const match = all.find((r) => r.tag_name.startsWith("xcode-ext-v"));
  if (!match) {
    exit(
      "No xcode-ext-v* release found on GitHub yet. The first notarized build hasn't shipped."
    );
  }
  return match;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { "User-Agent": "axint-cli" } });
  if (!res.ok || !res.body) exit(`Download failed: ${res.status}`);
  const out = createWriteStream(dest);
  await pipeline(res.body as unknown as NodeJS.ReadableStream, out);
}

// ─── System integration ──────────────────────────────────────────────

async function openExtensionsSettings(): Promise<void> {
  // Deep link into Extensions pane. macOS 13+ uses the `x-apple.systempreferences:`
  // URL scheme with an anchor to the Xcode Source Editor pane.
  await run("open", [
    "x-apple.systempreferences:com.apple.ExtensionsPreferences?Xcode%20Source%20Editor",
  ]).catch(() => {
    /* best effort — if the anchor changes between OS versions, fall through */
  });
}

async function readInfoPlistVersion(appPath: string): Promise<string | null> {
  const plist = join(appPath, "Contents", "Info.plist");
  if (!existsSync(plist)) return null;
  return new Promise((resolve) => {
    const child = spawn("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleShortVersionString",
      plist,
    ]);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => resolve(code === 0 ? out.trim() : null));
    child.on("error", () => resolve(null));
  });
}

// ─── Tiny helpers ────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  else if (!statSync(dir).isDirectory()) exit(`${dir} exists and is not a directory`);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))
    );
    child.on("error", reject);
  });
}

function info(msg: string) {
  process.stdout.write(`${msg}\n`);
}
function done(msg: string) {
  process.stdout.write(`\n${msg}\n`);
}
function exit(msg: string): never {
  process.stderr.write(`axint: ${msg}\n`);
  process.exit(1);
}
