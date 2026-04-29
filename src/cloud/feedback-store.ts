import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  queueAutomaticFeedback,
  type AxintAutoFeedbackQueueResult,
} from "../feedback/auto.js";
import type { CloudLearningSignal } from "./check.js";

export interface StoredCloudFeedback {
  path: string;
  signal: CloudLearningSignal;
  autoFeedback?: AxintAutoFeedbackQueueResult;
}

export function writeCloudFeedbackSignal(
  signal: CloudLearningSignal,
  options: { cwd?: string; dir?: string } = {}
): StoredCloudFeedback {
  const root = resolve(options.cwd ?? process.cwd(), options.dir ?? ".axint/feedback");
  mkdirSync(root, { recursive: true });
  const path = resolve(root, `${signal.fingerprint}.json`);
  writeFileSync(path, `${JSON.stringify(signal, null, 2)}\n`, "utf-8");
  const autoFeedback = queueAutomaticFeedback(signal, {
    cwd: options.cwd,
    packetType: "cloud",
  });
  return { path, signal, autoFeedback };
}
