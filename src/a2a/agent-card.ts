import { readFileSync } from "node:fs";
import {
  A2A_PROTOCOL_VERSION,
  type AgentCard,
  type SecurityRequirement,
} from "@a2a-js/sdk";
import { AXINT_A2A_INPUT_MEDIA_TYPE, AXINT_A2A_RESULT_MEDIA_TYPE } from "./types.js";

export interface AxintAgentCardOptions {
  endpointUrl: string;
  authenticationRequired: boolean;
  documentationUrl?: string;
  iconUrl?: string;
}

export function createAxintAgentCard(options: AxintAgentCardOptions): AgentCard {
  const securityRequirements: SecurityRequirement[] = options.authenticationRequired
    ? [{ schemes: { Bearer: { list: [] } } }]
    : [];
  const skillSecurity = securityRequirements.map((requirement) =>
    structuredClone(requirement)
  );
  return {
    name: "Axint Apple Proof and Repair",
    description:
      "Checks Apple code, diagnoses Xcode failures, plans repairs, and produces signed build-and-test proof without retaining input source in task history or returning raw logs.",
    supportedInterfaces: [
      {
        url: options.endpointUrl,
        protocolBinding: "JSONRPC",
        tenant: "",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    provider: {
      organization: "Axint",
      url: "https://axint.ai",
    },
    version: packageVersion(),
    documentationUrl: options.documentationUrl ?? "https://docs.axint.ai/a2a",
    iconUrl: options.iconUrl ?? "https://axint.ai/favicon.svg",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [],
    },
    securitySchemes: options.authenticationRequired
      ? {
          Bearer: {
            scheme: {
              $case: "httpAuthSecurityScheme",
              value: {
                description: "Bearer token configured by the Axint A2A operator.",
                scheme: "bearer",
                bearerFormat: "Opaque",
              },
            },
          },
        }
      : {},
    securityRequirements,
    defaultInputModes: [AXINT_A2A_INPUT_MEDIA_TYPE, "application/json", "text/plain"],
    defaultOutputModes: [
      AXINT_A2A_RESULT_MEDIA_TYPE,
      "application/json",
      "text/markdown",
    ],
    skills: [
      {
        id: "check_apple_code",
        name: "Check Apple code",
        description:
          "Validate Swift or Axint source and return compiler-grounded diagnostics with confidence and evidence requirements.",
        tags: ["swift", "static-analysis", "app-intents", "swiftui", "accessibility"],
        examples: [
          'Send {"skill":"check_apple_code","input":{"sourcePath":"Sources/App.swift"}}.',
        ],
        inputModes: [AXINT_A2A_INPUT_MEDIA_TYPE, "application/json", "text/plain"],
        outputModes: [AXINT_A2A_RESULT_MEDIA_TYPE, "application/json", "text/markdown"],
        securityRequirements: skillSecurity,
      },
      {
        id: "diagnose_apple_failure",
        name: "Diagnose an Apple failure",
        description:
          "Classify Xcode build, test, runtime, and Apple-platform failures and return ranked, source-free hypotheses.",
        tags: ["xcode", "diagnostics", "tests", "runtime", "repair"],
        examples: [
          'Send {"skill":"diagnose_apple_failure","input":{"issue":"The UI test cannot find the Save button"}}.',
        ],
        inputModes: [AXINT_A2A_INPUT_MEDIA_TYPE, "application/json", "text/plain"],
        outputModes: [AXINT_A2A_RESULT_MEDIA_TYPE, "application/json", "text/markdown"],
        securityRequirements: skillSecurity,
      },
      {
        id: "prove_apple_project",
        name: "Prove an Apple project",
        description:
          "Run resumable Xcode build and test evidence locally and return a signed, source-free proof receipt.",
        tags: ["xcodebuild", "xcresult", "build", "test", "proof"],
        examples: [
          'Send {"skill":"prove_apple_project","input":{"projectPath":".","scheme":"App"}}.',
        ],
        inputModes: [AXINT_A2A_INPUT_MEDIA_TYPE, "application/json", "text/plain"],
        outputModes: [AXINT_A2A_RESULT_MEDIA_TYPE, "application/json", "text/markdown"],
        securityRequirements: skillSecurity,
      },
      {
        id: "plan_apple_repair",
        name: "Plan an Apple repair",
        description:
          "Produce an evidence-first repair plan with likely causes, files to inspect, and the exact proof sequence, without modifying source.",
        tags: ["repair", "planning", "swift", "xcode", "evidence"],
        examples: [
          'Send {"skill":"plan_apple_repair","input":{"issue":"The App Intent fails after authorization"}}.',
        ],
        inputModes: [AXINT_A2A_INPUT_MEDIA_TYPE, "application/json", "text/plain"],
        outputModes: [AXINT_A2A_RESULT_MEDIA_TYPE, "application/json", "text/markdown"],
        securityRequirements: skillSecurity,
      },
    ],
    signatures: [],
  };
}

function packageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as { version?: string };
    return packageJson.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
