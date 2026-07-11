import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import {
  readAndVerifyProofReceipt,
  renderProofReceipt,
  type AxintSignedProofReceipt,
} from "../proof/receipt.js";

export function registerReceipt(program: Command) {
  const receipt = program
    .command("receipt")
    .description("Inspect and cryptographically verify portable Axint proof receipts");

  receipt
    .command("verify")
    .description("Verify a proof receipt payload hash and Ed25519 signature")
    .argument("<path>", "Path to a .proof.json receipt")
    .option(
      "--trusted-fingerprint <fingerprint>",
      "Require this signer fingerprint, suitable for pinned CI identities"
    )
    .option("--json", "Render JSON")
    .action((path: string, options: { json?: boolean; trustedFingerprint?: string }) => {
      const result = readAndVerifyProofReceipt(path, {
        trustedFingerprint: options.trustedFingerprint,
      });
      if (options.json) {
        console.log(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        console.log(
          [
            result.valid
              ? "Axint proof receipt is valid."
              : "Axint proof receipt is invalid.",
            `Receipt: ${result.receiptId ?? "unknown"}`,
            `Payload hash: ${result.payloadHashMatches ? "valid" : "invalid"}`,
            `Signature: ${result.signatureValid ? "valid" : "invalid"}`,
            `Signer fingerprint: ${result.signerFingerprintMatches ? "valid" : "invalid"}`,
            options.trustedFingerprint
              ? `Trusted signer: ${result.trustedFingerprintMatches ? "matched" : "mismatch"}`
              : "Trusted signer: not pinned",
            result.signer
              ? `Signer: ${result.signer.name} (${result.signer.fingerprint})`
              : undefined,
            `Reason: ${result.reason}`,
          ]
            .filter(Boolean)
            .join("\n")
        );
      }
      if (!result.valid) process.exitCode = 1;
    });

  receipt
    .command("show")
    .description("Render a portable proof receipt as Markdown")
    .argument("<path>", "Path to a .proof.json receipt")
    .action((path: string) => {
      const parsed = JSON.parse(
        readFileSync(resolve(path), "utf-8")
      ) as AxintSignedProofReceipt;
      console.log(renderProofReceipt(parsed));
    });
}
