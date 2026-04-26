import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CloudLearningSignal } from "./check.js";

export interface StoredCloudFeedback {
  path: string;
  signal: CloudLearningSignal;
}

export function writeCloudFeedbackSignal(
  signal: CloudLearningSignal,
  options: { cwd?: string; dir?: string } = {}
): StoredCloudFeedback {
  const root = resolve(options.cwd ?? process.cwd(), options.dir ?? ".axint/feedback");
  mkdirSync(root, { recursive: true });
  const path = resolve(root, `${signal.fingerprint}.json`);
  writeFileSync(path, `${JSON.stringify(signal, null, 2)}\n`, "utf-8");
  return { path, signal };
}
