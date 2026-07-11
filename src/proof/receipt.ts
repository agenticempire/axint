import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform as osPlatform, release as osRelease } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { Diagnostic, DiagnosticEvidence } from "../core/types.js";
import type {
  AxintRunCommandResult,
  AxintRunReport,
  AxintRunStep,
} from "../run/project-runner.js";

export interface AxintProofRepair {
  file: string;
  codes: string[];
  outcome: "applied" | "proposed";
}

export interface AxintProofReceiptPayload {
  id: string;
  createdAt: string;
  tool: {
    name: "axint";
    version: string;
    command: "axint prove";
  };
  project: {
    name: string;
    platform: string;
    scheme?: string;
    git: {
      available: boolean;
      commit?: string;
      branch?: string;
      dirty: boolean;
      changedFiles: number;
    };
  };
  environment: {
    os: string;
    architecture: string;
    node: string;
    xcode?: string;
    swift?: string;
  };
  execution: AxintRunReport["executionProfile"];
  outcome: {
    status: AxintRunReport["status"];
    decision: AxintRunReport["gate"]["decision"];
    reason: string;
  };
  evidence: {
    summary: AxintRunReport["swiftValidation"]["evidenceSummary"];
    steps: Array<Pick<AxintRunStep, "name" | "state" | "detail" | "durationMs">>;
    commands: Array<{
      kind: "build" | "test" | "runtime";
      executable: string;
      exitCode: number | null;
      signal: string | null;
      timedOut: boolean;
      durationMs: number;
      dryRun: boolean;
      artifact?: {
        name: string;
        sha256?: string;
      };
    }>;
    xcodeTestFailures: AxintRunReport["xcodeTestFailures"];
    runnerHealth: AxintRunReport["runnerHealth"];
  };
  findings: Diagnostic[];
  repairs: AxintProofRepair[];
  privacy: {
    sourceIncluded: false;
    commandOutputIncluded: false;
    absoluteLocalPathsIncluded: false;
    projectRelativePathsIncluded: true;
  };
}

export interface AxintSignedProofReceipt {
  schema: "https://axint.ai/schemas/proof-receipt.v1.json";
  payload: AxintProofReceiptPayload;
  integrity: {
    algorithm: "Ed25519";
    canonicalization: "axint-canonical-json-v1";
    payloadHash: string;
    signature: string;
    publicKey: string;
    signer: {
      kind: "local" | "managed";
      name: string;
      fingerprint: string;
    };
  };
}

export interface AxintProofReceiptArtifacts {
  json: string;
  markdown: string;
  immutableJson: string;
}

export interface AxintProofReceiptVerification {
  valid: boolean;
  receiptId?: string;
  payloadHashMatches: boolean;
  signatureValid: boolean;
  signerFingerprintMatches: boolean;
  trustedFingerprintMatches?: boolean;
  signer?: AxintSignedProofReceipt["integrity"]["signer"];
  reason: string;
}

export function createSignedProofReceipt(input: {
  report: AxintRunReport;
  version: string;
  repairs?: AxintProofRepair[];
  sourceMutation?: boolean;
}): AxintSignedProofReceipt {
  const payload = buildProofPayload(input);
  const canonical = canonicalJson(payload);
  const payloadHash = `sha256:${sha256(canonical)}`;
  const identity = loadSigningIdentity();
  const integrity = {
    algorithm: "Ed25519" as const,
    canonicalization: "axint-canonical-json-v1" as const,
    payloadHash,
    publicKey: identity.publicKeyPem,
    signer: {
      kind: identity.kind,
      name: identity.name,
      fingerprint: identity.fingerprint,
    },
  };
  const signature = sign(
    null,
    Buffer.from(signatureContent(payload, integrity)),
    identity.privateKey
  ).toString("base64");

  return {
    schema: "https://axint.ai/schemas/proof-receipt.v1.json",
    payload,
    integrity: {
      ...integrity,
      signature,
    },
  };
}

export function writeSignedProofReceipt(
  receipt: AxintSignedProofReceipt,
  outputDirectory: string
): AxintProofReceiptArtifacts {
  const directory = resolve(outputDirectory);
  mkdirSync(directory, { recursive: true });
  const json = join(directory, "latest.proof.json");
  const markdown = join(directory, "latest.proof.md");
  const immutableJson = join(directory, `${receipt.payload.id}.proof.json`);
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  writeFileSync(json, serialized, "utf-8");
  writeFileSync(immutableJson, serialized, "utf-8");
  writeFileSync(markdown, renderProofReceipt(receipt), "utf-8");
  return { json, markdown, immutableJson };
}

export function verifySignedProofReceipt(
  value: unknown,
  options: { trustedFingerprint?: string } = {}
): AxintProofReceiptVerification {
  if (!isSignedProofReceipt(value)) {
    return {
      valid: false,
      payloadHashMatches: false,
      signatureValid: false,
      signerFingerprintMatches: false,
      reason: "The JSON does not match the Axint proof receipt v1 schema.",
    };
  }

  try {
    const canonical = canonicalJson(value.payload);
    const expectedHash = `sha256:${sha256(canonical)}`;
    const payloadHashMatches = expectedHash === value.integrity.payloadHash;
    const publicKey = createPublicKey(value.integrity.publicKey);
    const publicDer = publicKey.export({ type: "spki", format: "der" });
    const signerFingerprintMatches =
      `sha256:${sha256(publicDer).slice(0, 24)}` === value.integrity.signer.fingerprint;
    const trustedFingerprintMatches = options.trustedFingerprint
      ? normalizeFingerprint(options.trustedFingerprint) ===
        normalizeFingerprint(value.integrity.signer.fingerprint)
      : undefined;
    const signatureValid = verify(
      null,
      Buffer.from(
        signatureContent(value.payload, {
          algorithm: value.integrity.algorithm,
          canonicalization: value.integrity.canonicalization,
          payloadHash: value.integrity.payloadHash,
          publicKey: value.integrity.publicKey,
          signer: value.integrity.signer,
        })
      ),
      publicKey,
      Buffer.from(value.integrity.signature, "base64")
    );
    return {
      valid:
        payloadHashMatches &&
        signerFingerprintMatches &&
        signatureValid &&
        trustedFingerprintMatches !== false,
      receiptId: value.payload.id,
      payloadHashMatches,
      signatureValid,
      signerFingerprintMatches,
      trustedFingerprintMatches,
      signer: value.integrity.signer,
      reason:
        payloadHashMatches &&
        signerFingerprintMatches &&
        signatureValid &&
        trustedFingerprintMatches !== false
          ? "The payload hash, signer fingerprint, and Ed25519 signature are valid."
          : !payloadHashMatches
            ? "The receipt payload no longer matches its recorded hash."
            : !signerFingerprintMatches
              ? "The signer fingerprint does not match the embedded public key."
              : trustedFingerprintMatches === false
                ? "The receipt signer does not match the trusted fingerprint."
                : "The Ed25519 signature is invalid.",
    };
  } catch (error) {
    return {
      valid: false,
      receiptId: value.payload.id,
      payloadHashMatches: false,
      signatureValid: false,
      signerFingerprintMatches: false,
      signer: value.integrity.signer,
      reason: `Receipt verification failed: ${(error as Error).message}`,
    };
  }
}

export function readAndVerifyProofReceipt(
  path: string,
  options: { trustedFingerprint?: string } = {}
): AxintProofReceiptVerification {
  const parsed = JSON.parse(readFileSync(resolve(path), "utf-8")) as unknown;
  return verifySignedProofReceipt(parsed, options);
}

export function renderProofReceipt(receipt: AxintSignedProofReceipt): string {
  const payload = receipt.payload;
  const verification = verifySignedProofReceipt(receipt);
  return [
    `# Axint Proof: ${payload.outcome.decision}`,
    "",
    `- Receipt: ${payload.id}`,
    `- Project: ${payload.project.name}`,
    `- Platform: ${payload.project.platform}`,
    `- Tool: Axint ${payload.tool.version}`,
    `- Status: ${payload.outcome.status}`,
    `- Decision: ${payload.outcome.decision}`,
    `- Reason: ${payload.outcome.reason}`,
    `- Git commit: ${payload.project.git.commit ?? "unavailable"}${payload.project.git.dirty ? " (dirty working tree)" : ""}`,
    `- Signature: ${verification.valid ? "valid" : "invalid"}`,
    `- Signer: ${receipt.integrity.signer.name} (${receipt.integrity.signer.fingerprint})`,
    "",
    "## Evidence",
    "",
    `- ${payload.evidence.summary.confirmed} confirmed`,
    `- ${payload.evidence.summary.probable} probable`,
    `- ${payload.evidence.summary.advisory} advisory`,
    `- ${payload.evidence.summary.suppressed} suppressed`,
    `- ${payload.evidence.summary.blocking} blocking`,
    ...payload.evidence.commands.map(
      (command) =>
        `- ${command.kind}: ${command.dryRun ? "planned" : command.exitCode === 0 ? "passed" : "failed"} · ${command.durationMs} ms${command.artifact?.sha256 ? ` · artifact sha256:${command.artifact.sha256}` : ""}`
    ),
    "",
    "## Findings",
    "",
    ...(payload.findings.length
      ? payload.findings.map(
          (finding) =>
            `- ${finding.code} ${finding.id} [${finding.status === "suppressed" ? "suppressed" : (finding.confidence ?? "probable")}]: ${finding.message}${finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""}`
        )
      : ["- None."]),
    "",
    "## Repairs",
    "",
    ...(payload.repairs.length
      ? payload.repairs.map(
          (repair) => `- ${repair.outcome}: ${repair.file} (${repair.codes.join(", ")})`
        )
      : ["- No deterministic repairs were applied."]),
    "",
    "## Verify",
    "",
    "```bash",
    "axint receipt verify latest.proof.json",
    "```",
    "",
    "This receipt contains no source code, command output, private key, or absolute local path.",
  ].join("\n");
}

function buildProofPayload(input: {
  report: AxintRunReport;
  version: string;
  repairs?: AxintProofRepair[];
  sourceMutation?: boolean;
}): AxintProofReceiptPayload {
  const report = input.report;
  return {
    id: `axproof_${report.id.replace(/^axrun_/, "")}`,
    createdAt: report.createdAt,
    tool: {
      name: "axint",
      version: input.version,
      command: "axint prove",
    },
    project: {
      name: report.projectName,
      platform: report.platform,
      scheme: report.scheme,
      git: readGitState(report.cwd),
    },
    environment: readEnvironment(),
    execution: {
      ...report.executionProfile,
      automaticFixes: input.sourceMutation === true,
      projectMutation: input.sourceMutation ? "allowed" : "denied",
      outputDirectory: report.executionProfile.outputDirectory
        ? basename(report.executionProfile.outputDirectory)
        : undefined,
    },
    outcome: {
      status: report.status,
      decision: report.gate.decision,
      reason: report.gate.reason,
    },
    evidence: {
      summary: report.swiftValidation.evidenceSummary,
      steps: report.steps.map((step) => ({
        name: step.name,
        state: step.state,
        detail: sanitizeText(step.detail, report.cwd),
        durationMs: step.durationMs,
      })),
      commands: commandEvidence(report),
      xcodeTestFailures: report.xcodeTestFailures.map((failure) => ({
        ...failure,
        file: sanitizePath(failure.file, report.cwd),
      })),
      runnerHealth: report.runnerHealth.map((issue) => ({
        ...issue,
        command: undefined,
        evidence: sanitizeText(issue.evidence, report.cwd),
      })),
    },
    findings: report.swiftValidation.diagnostics.map((finding) =>
      sanitizeFinding(finding, report.cwd)
    ),
    repairs: input.repairs ?? [],
    privacy: {
      sourceIncluded: false,
      commandOutputIncluded: false,
      absoluteLocalPathsIncluded: false,
      projectRelativePathsIncluded: true,
    },
  };
}

function commandEvidence(
  report: AxintRunReport
): AxintProofReceiptPayload["evidence"]["commands"] {
  const pairs: Array<["build" | "test" | "runtime", AxintRunCommandResult | undefined]> =
    [
      ["build", report.commands.build],
      ["test", report.commands.test],
      ["runtime", report.commands.runtime],
    ];
  return pairs.flatMap(([kind, command]) => {
    if (!command) return [];
    const artifactPath = command.resultBundlePath ?? command.logPath;
    return [
      {
        kind,
        executable: basename(command.command),
        exitCode: command.exitCode,
        signal: command.signal,
        timedOut: command.timedOut,
        durationMs: command.durationMs,
        dryRun: command.dryRun === true,
        artifact: artifactPath
          ? {
              name: basename(artifactPath),
              sha256: hashFileIfRegular(artifactPath),
            }
          : undefined,
      },
    ];
  });
}

function sanitizeFinding(finding: Diagnostic, cwd: string): Diagnostic {
  return {
    ...finding,
    file: sanitizePath(finding.file, cwd),
    evidence: finding.evidence?.map((evidence) => sanitizeEvidence(evidence, cwd)),
  };
}

function sanitizeEvidence(evidence: DiagnosticEvidence, cwd: string): DiagnosticEvidence {
  return {
    ...evidence,
    summary: sanitizeText(evidence.summary, cwd),
    command: undefined,
    artifactPath: evidence.artifactPath ? basename(evidence.artifactPath) : undefined,
  };
}

function sanitizePath(path: string | undefined, cwd: string): string | undefined {
  if (!path) return undefined;
  if (!isAbsolute(path)) return path.replace(/\\/g, "/");
  const rel = relative(cwd, path);
  return rel.startsWith("..") ? basename(path) : rel.replace(/\\/g, "/");
}

function sanitizeText(value: string, cwd: string): string {
  return value
    .split(cwd)
    .join("<project>")
    .replace(
      /\/(?:Users|home|tmp|private|var|Volumes)\/[A-Za-z0-9_@%+=:,./-]+/g,
      "<local-path>"
    );
}

function readGitState(cwd: string): AxintProofReceiptPayload["project"]["git"] {
  const commit = runText("git", ["rev-parse", "HEAD"], cwd);
  if (!commit) return { available: false, dirty: false, changedFiles: 0 };
  const status = runText("git", ["status", "--porcelain"], cwd) ?? "";
  return {
    available: true,
    commit,
    branch: runText("git", ["branch", "--show-current"], cwd),
    dirty: status.length > 0,
    changedFiles: status ? status.split(/\r?\n/).filter(Boolean).length : 0,
  };
}

function readEnvironment(): AxintProofReceiptPayload["environment"] {
  return {
    os: `${osPlatform()} ${osRelease()}`,
    architecture: process.arch,
    node: process.version,
    xcode: runText("xcodebuild", ["-version"]),
    swift: runText("swift", ["--version"]),
  };
}

function runText(command: string, args: string[], cwd?: string): string | undefined {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    timeout: 5_000,
  });
  if (result.status !== 0) return undefined;
  const text = result.stdout.trim().replace(/\s+/g, " ");
  return text || undefined;
}

function hashFileIfRegular(path: string): string | undefined {
  try {
    return sha256(readFileSync(path));
  } catch {
    return undefined;
  }
}

function loadSigningIdentity(): {
  privateKey: ReturnType<typeof createPrivateKey>;
  publicKeyPem: string;
  fingerprint: string;
  kind: "local" | "managed";
  name: string;
} {
  const configured = process.env.AXINT_PROOF_SIGNING_KEY;
  const kind = configured ? "managed" : "local";
  const privateKeyPem = configured
    ? configured.includes("BEGIN PRIVATE KEY")
      ? configured
      : readFileSync(resolve(configured), "utf-8")
    : loadOrCreateLocalPrivateKey();
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKeyPem);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  return {
    privateKey,
    publicKeyPem,
    fingerprint: `sha256:${sha256(publicDer).slice(0, 24)}`,
    kind,
    name:
      process.env.AXINT_PROOF_SIGNER_NAME ??
      (kind === "managed" ? "Configured Axint signer" : "Local Axint signer"),
  };
}

function loadOrCreateLocalPrivateKey(): string {
  const directory = resolve(process.env.AXINT_HOME ?? join(homedir(), ".axint"), "keys");
  const path = join(directory, "proof-ed25519-private.pem");
  if (existsSync(path)) return readFileSync(path, "utf-8");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  try {
    writeFileSync(path, pem, {
      encoding: "utf-8",
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return readFileSync(path, "utf-8");
    }
    throw error;
  }
  chmodSync(path, 0o600);
  return pem;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function signatureContent(
  payload: AxintProofReceiptPayload,
  integrity: Omit<AxintSignedProofReceipt["integrity"], "signature">
): string {
  return canonicalJson({
    schema: "https://axint.ai/schemas/proof-receipt.v1.json",
    payload,
    integrity,
  });
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeFingerprint(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("sha256:") ? normalized : `sha256:${normalized}`;
}

function isSignedProofReceipt(value: unknown): value is AxintSignedProofReceipt {
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  if (object.schema !== "https://axint.ai/schemas/proof-receipt.v1.json") {
    return false;
  }
  if (!object.payload || typeof object.payload !== "object") return false;
  if (!object.integrity || typeof object.integrity !== "object") return false;
  const payload = object.payload as Record<string, unknown>;
  const integrity = object.integrity as Record<string, unknown>;
  return (
    typeof payload.id === "string" &&
    integrity.algorithm === "Ed25519" &&
    integrity.canonicalization === "axint-canonical-json-v1" &&
    typeof integrity.payloadHash === "string" &&
    typeof integrity.signature === "string" &&
    typeof integrity.publicKey === "string" &&
    Boolean(
      integrity.signer &&
      typeof integrity.signer === "object" &&
      typeof (integrity.signer as Record<string, unknown>).name === "string" &&
      typeof (integrity.signer as Record<string, unknown>).fingerprint === "string"
    )
  );
}
