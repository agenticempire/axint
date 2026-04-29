export type AppleRepairIssueClass =
  | "swiftui-input-interaction"
  | "swiftui-hit-testing"
  | "swiftui-routing-state"
  | "swiftui-layout-regression"
  | "ui-test-accessibility"
  | "runtime-freeze"
  | "xcode-build-repair"
  | "apple-project-repair";

export interface AppleRepairRootCause {
  title: string;
  confidence: "high" | "medium" | "low";
  detail: string;
  inspect: string[];
  suggestedPatch: string;
}

export interface AppleRepairIntelligence {
  isExistingProductRepair: boolean;
  issueClass: AppleRepairIssueClass;
  confidence: "high" | "medium" | "low";
  summary: string;
  signals: string[];
  rootCauses: AppleRepairRootCause[];
  inspectionChecklist: string[];
  proofPlan: string[];
  avoid: string[];
}

export interface AppleRepairIntelligenceInput {
  text?: string;
  source?: string;
  fileName?: string;
  platform?: string;
}

export function analyzeAppleRepairTask(
  input: AppleRepairIntelligenceInput
): AppleRepairIntelligence {
  const text = normalizeEvidence(input.text ?? "");
  const source = input.source ?? "";
  const sourceText = normalizeEvidence(source);
  const issueClass = classifyAppleRepairIssue(text, sourceText);
  const signals = inferRepairSignals(text, sourceText);
  const isExistingProductRepair = looksLikeExistingAppleRepair(text, signals);
  const rootCauses = buildRootCauses({ issueClass, text, source, sourceText });
  const confidence = inferRepairConfidence({
    isExistingProductRepair,
    issueClass,
    rootCauses,
    source,
    text,
  });

  return {
    isExistingProductRepair,
    issueClass,
    confidence,
    summary: buildRepairSummary({
      issueClass,
      isExistingProductRepair,
      confidence,
      rootCauses,
      platform: input.platform,
    }),
    signals,
    rootCauses,
    inspectionChecklist: buildInspectionChecklist(issueClass, signals),
    proofPlan: buildProofPlan(issueClass, input.fileName),
    avoid: [
      "Do not replace the whole screen when the bug is in an existing product flow.",
      "Do not claim fixed from static source checks alone when the failure is runtime, route, focus, or hit-testing behavior.",
      "Do not patch only the visible child before checking parent wrappers, overlays, disabled state, gestures, and shared stores.",
    ],
  };
}

export function looksLikeExistingAppleRepairText(text: string): boolean {
  const normalized = normalizeEvidence(text);
  return looksLikeExistingAppleRepair(normalized, inferRepairSignals(normalized, ""));
}

export function formatAppleRepairRead(analysis: AppleRepairIntelligence): string[] {
  return [
    `Senior Apple repair read: ${analysis.summary}`,
    `Issue class: ${analysis.issueClass}`,
    `Confidence: ${analysis.confidence}`,
    ...(analysis.signals.length > 0
      ? [`Signals: ${analysis.signals.slice(0, 6).join(", ")}`]
      : []),
    ...(analysis.rootCauses.length > 0
      ? [
          "Likely root causes:",
          ...analysis.rootCauses
            .slice(0, 3)
            .map(
              (cause) => `- ${cause.title} (${cause.confidence}): ${cause.suggestedPatch}`
            ),
        ]
      : []),
  ];
}

function classifyAppleRepairIssue(
  text: string,
  sourceText: string
): AppleRepairIssueClass {
  if (
    hasAny(text, [
      "comment box",
      "compose box",
      "composer",
      "reply box",
      "post box",
      "text field",
      "textfield",
      "text editor",
      "texteditor",
      "input field",
      "input",
      "keyboard",
      "focus",
    ]) &&
    hasAny(text, [
      "can't tap",
      "cannot tap",
      "can't be tapped",
      "cannot be tapped",
      "can't type",
      "cannot type",
      "can't be typed",
      "cannot be typed",
      "won't focus",
      "cannot focus",
      "cannot be focused",
      "no longer accepts",
      "stopped accepting",
      "visible but dead",
      "not editable",
      "not interactable",
      "tap ignored",
    ])
  ) {
    return "swiftui-input-interaction";
  }

  if (
    hasAny(text, [
      "should be hittable",
      "not hittable",
      "not tappable",
      "not foreground",
      "background interaction",
      "failed to synthesize event",
      "hit point",
      "scroll",
    ])
  ) {
    return "swiftui-hit-testing";
  }

  if (
    hasAny(text, [
      "wrong tab",
      "does not route",
      "doesn't route",
      "navigation",
      "route",
      "destination",
      "sheet",
      "popover",
      "opens wrong",
      "selected tab",
      "state doesn't update",
      "state does not update",
    ])
  ) {
    return "swiftui-routing-state";
  }

  if (
    hasAny(text, [
      "layout",
      "above the fold",
      "first viewport",
      "spacing",
      "overlap",
      "clipped",
      "blank",
      "responsive",
      "alignment",
    ])
  ) {
    return "swiftui-layout-regression";
  }

  if (
    hasAny(text, [
      "freeze",
      "freezes",
      "frozen",
      "hang",
      "hung",
      "beachball",
      "unresponsive",
      "launch timeout",
      "not responding",
    ]) ||
    hasAny(sourceText, [
      "dispatchqueue.main.sync",
      "dispatchsemaphore",
      "thread.sleep",
      "data(contentsof:",
    ])
  ) {
    return "runtime-freeze";
  }

  if (
    hasAny(text, [
      "cannot find",
      "no member",
      "incorrect argument label",
      "type mismatch",
      "does not conform",
      "build failed",
      "error:",
    ])
  ) {
    return "xcode-build-repair";
  }

  if (
    hasAny(text, [
      "accessibility",
      "identifier",
      "no matches",
      "not found",
      "does not exist",
      "wait timed out",
    ])
  ) {
    return "ui-test-accessibility";
  }

  return "apple-project-repair";
}

function inferRepairSignals(text: string, sourceText: string): string[] {
  const signals: string[] = [];
  const add = (condition: boolean, signal: string) => {
    if (condition && !signals.includes(signal)) signals.push(signal);
  };

  add(
    hasAny(text, ["existing", "current", "regression", "no longer", "stopped"]),
    "existing-product"
  );
  add(
    hasAny(text, ["fix", "repair", "broken", "bug", "not working", "fails", "failing"]),
    "repair-intent"
  );
  add(
    hasAny(text, ["tap", "click", "hittable", "foreground", "background interaction"]),
    "hit-testing"
  );
  add(
    hasAny(text, [
      "type",
      "focus",
      "keyboard",
      "composer",
      "comment box",
      "text field",
      "input",
    ]),
    "input-focus"
  );
  add(
    hasAny(text, ["route", "tab", "navigation", "sheet", "popover", "destination"]),
    "routing-state"
  );
  add(
    hasAny(text, [
      "ui test",
      "xctest",
      "xcuielement",
      "only-testing",
      "test succeeded",
      "test failed",
    ]),
    "xcode-ui-proof"
  );
  add(hasAny(text, ["build", "xcodebuild", "compiler", "error:"]), "xcode-build-proof");
  add(
    hasAny(text, ["freeze", "hang", "unresponsive", "beachball", "launch timeout"]),
    "runtime-proof"
  );
  add(
    hasAny(sourceText, [".overlay", "zstack", ".zindex", ".allowshittesting"]),
    "overlay-hit-area"
  );
  add(hasAny(sourceText, [".disabled("]), "disabled-state");
  add(
    hasAny(sourceText, [".gesture", ".ontapgesture", ".highprioritygesture"]),
    "gesture-capture"
  );
  add(hasAny(sourceText, ["@focusstate", "focused("]), "focus-state");
  add(hasAny(sourceText, [".accessibilityidentifier", "xcui"]), "accessibility-tree");
  add(hasAny(sourceText, ["scrollview", "list {", "lazyvstack"]), "scroll-container");

  return signals;
}

function looksLikeExistingAppleRepair(text: string, signals: string[]): boolean {
  const failureIntent = hasAny(text, [
    "can't",
    "cannot",
    "won't",
    "does not",
    "doesn't",
    "no longer",
    "stopped",
    "visible but",
    "should be",
    "not foreground",
    "not hittable",
    "not tappable",
    "not working",
    "fails",
    "failing",
    "broken",
    "bug",
  ]);
  const repairIntent =
    signals.includes("repair-intent") ||
    failureIntent ||
    (signals.includes("existing-product") &&
      hasAny(text, ["fix", "repair", "regression"]));
  const appleSurface =
    hasAny(text, [
      "swiftui",
      "xcode",
      "view",
      "screen",
      "tab",
      "button",
      "composer",
      "comment box",
      "text field",
      "widget",
      "app intent",
      "macos",
      "ios",
    ]) ||
    signals.some((signal) =>
      [
        "hit-testing",
        "input-focus",
        "routing-state",
        "xcode-ui-proof",
        "xcode-build-proof",
        "runtime-proof",
      ].includes(signal)
    );

  if (/\b(create|generate|scaffold|build)\s+(?:a|an|new)\b/.test(text) && !repairIntent) {
    return false;
  }

  return repairIntent && appleSurface;
}

function buildRootCauses(input: {
  issueClass: AppleRepairIssueClass;
  text: string;
  source: string;
  sourceText: string;
}): AppleRepairRootCause[] {
  const causes: AppleRepairRootCause[] = [];
  const hasSource = input.source.trim().length > 0;

  if (input.issueClass === "swiftui-hit-testing") {
    causes.push({
      title: "UI test is hitting an element hidden by foreground or hit-test state",
      confidence: "high",
      detail:
        "macOS UI tests can find a node in the accessibility tree while a sheet, inactive window, broad parent identifier, scroll state, or overlay owns the actual hit point.",
      inspect: [
        "foreground window",
        "blocking sheet/popover",
        "scroll position",
        "actionable Button/Text child",
        "parent accessibility container",
      ],
      suggestedPatch:
        "Activate the app/window, dismiss blockers, scroll to the exact element, and attach identifiers to the actionable child before asserting hittability.",
    });
  }

  if (
    input.issueClass === "swiftui-input-interaction" ||
    input.issueClass === "swiftui-hit-testing"
  ) {
    causes.push({
      title: "Parent layer or overlay is stealing the hit test",
      confidence: hasAny(input.sourceText, [
        ".overlay",
        "zstack",
        ".zindex",
        ".allowshittesting",
      ])
        ? "high"
        : "medium",
      detail:
        "SwiftUI controls can stay visible while a placeholder, transparent overlay, ZStack sibling, sheet, or zIndex layer intercepts taps before the TextField/TextEditor/Button receives focus.",
      inspect: [
        ".overlay",
        "ZStack siblings",
        ".allowsHitTesting",
        ".zIndex",
        "sheets/popovers",
      ],
      suggestedPatch:
        "Add `.allowsHitTesting(false)` to decorative overlays, move interactive overlays outside the input hit area, or lower/remove the competing zIndex layer.",
    });
    causes.push({
      title: "Disabled or loading state is propagating too broadly",
      confidence: hasAny(input.sourceText, [".disabled("]) ? "high" : "medium",
      detail:
        "A new feature gate, posting/loading flag, permission branch, or modal state can disable an entire composer or command subtree.",
      inspect: [
        ".disabled(...)",
        "loading state",
        "permission gates",
        "feature flags",
        "modal state",
      ],
      suggestedPatch:
        "Move `.disabled(...)` to the exact button/action that should be blocked and keep the composer/input subtree outside the gated parent.",
    });
    causes.push({
      title: "Gesture or focus routing is swallowing first responder",
      confidence: hasAny(input.sourceText, [
        ".gesture",
        ".ontapgesture",
        ".highprioritygesture",
        "@focusstate",
      ])
        ? "high"
        : "low",
      detail:
        "Broad gestures, high-priority taps, scroll containers, or conflicting FocusState bindings can prevent the control from becoming first responder.",
      inspect: [
        ".gesture",
        ".highPriorityGesture",
        ".onTapGesture",
        "@FocusState",
        "ScrollView/List parent",
      ],
      suggestedPatch:
        "Narrow the gesture region, avoid high-priority capture over inputs, and assert the expected FocusState after tapping in a focused UI test.",
    });
  }

  if (input.issueClass === "swiftui-routing-state") {
    causes.push({
      title: "Action is wired to local demo state instead of the real route/store",
      confidence: "medium",
      detail:
        "Premium UI repairs often make buttons look correct but leave them connected to placeholder state, stale selected-tab values, or a sheet that is not the real destination.",
      inspect: [
        "Button action closures",
        "selected tab state",
        "navigation path",
        "sheet/popover booleans",
        "shared store mutation",
      ],
      suggestedPatch:
        "Trace the button to the app's real router/store, patch the smallest action binding, then prove it with a focused UI test that asserts the destination.",
    });
  }

  if (input.issueClass === "swiftui-layout-regression") {
    causes.push({
      title: "Responsive layout changed without first-viewport proof",
      confidence: "medium",
      detail:
        "A visual polish change can push the main action below the fold, hide content behind fixed chrome, or leave a lazy area blank until scrolled.",
      inspect: [
        "GeometryReader",
        "fixed heights",
        "safe area insets",
        "lazy containers",
        "min/max frame modifiers",
      ],
      suggestedPatch:
        "Patch layout constraints around the first viewport and prove desktop/mobile or compact/expanded states with a focused screenshot/UI assertion.",
    });
  }

  if (input.issueClass === "runtime-freeze") {
    causes.push({
      title: "Main-thread or launch-path blocker",
      confidence: hasSource ? "medium" : "low",
      detail:
        "Blocking work in View.body, init, onAppear, .task, App startup, or shared stores can freeze SwiftUI before the UI becomes interactive.",
      inspect: [
        "View.body",
        "init",
        "onAppear",
        ".task",
        "App startup",
        "synchronous IO/network waits",
      ],
      suggestedPatch:
        "Move blocking work into cancellable async model methods, add timeouts, and capture a short sample if the freeze still reproduces.",
    });
  }

  if (input.issueClass === "xcode-build-repair") {
    causes.push({
      title: "Generated code drifted from real project symbols",
      confidence: "high",
      detail:
        "Build errors usually mean the agent referenced a member, enum case, initializer, label, or type that does not exist in the local project.",
      inspect: [
        "missing symbol declaration",
        "call site signature",
        "target membership",
        "imports",
        "generated enum/token names",
      ],
      suggestedPatch:
        "Patch the call site to the real signature or add the missing file to the target; do not invent a second API beside the existing one.",
    });
  }

  if (input.issueClass === "ui-test-accessibility") {
    causes.push({
      title: "Accessibility query does not match the rendered element tree",
      confidence: "medium",
      detail:
        "SwiftUI identifiers can be attached too high, masked by parent containers, or asserted as the wrong XCUI element type.",
      inspect: [
        ".accessibilityIdentifier",
        "Button/Text child identifiers",
        "parent container identifiers",
        "XCUI element type",
        "label/value assertions",
      ],
      suggestedPatch:
        "Attach identifiers to the exact queried Button/Text/TextField and assert label or value when macOS StaticText exposes text through value.",
    });
  }

  if (causes.length === 0) {
    causes.push({
      title: "Existing Apple project needs source plus proof evidence",
      confidence: "low",
      detail:
        "Axint can guide the repair loop, but needs source, project index, build log, UI-test failure, or runtime evidence to name the likely root cause.",
      inspect: [
        "recently changed Swift files",
        "parent SwiftUI shell",
        "shared stores",
        "failing build/test log",
      ],
      suggestedPatch:
        "Run `axint project index`, pass the suspicious source file, and include the shortest failing Xcode/UI/runtime evidence.",
    });
  }

  return causes.slice(0, 4);
}

function inferRepairConfidence(input: {
  isExistingProductRepair: boolean;
  issueClass: AppleRepairIssueClass;
  rootCauses: AppleRepairRootCause[];
  source: string;
  text: string;
}): "high" | "medium" | "low" {
  if (
    input.isExistingProductRepair &&
    input.source.trim() &&
    input.rootCauses.some((cause) => cause.confidence === "high")
  ) {
    return "high";
  }
  if (
    input.isExistingProductRepair ||
    input.issueClass !== "apple-project-repair" ||
    input.source.trim() ||
    input.text.trim()
  ) {
    return "medium";
  }
  return "low";
}

function buildRepairSummary(input: {
  issueClass: AppleRepairIssueClass;
  isExistingProductRepair: boolean;
  confidence: "high" | "medium" | "low";
  rootCauses: AppleRepairRootCause[];
  platform?: string;
}): string {
  const platform = input.platform ? `${input.platform} ` : "";
  if (input.isExistingProductRepair) {
    const lead = input.rootCauses[0]?.title.toLowerCase() ?? "project context";
    return `Treat this as an existing ${platform}Apple repair, not a new scaffold. Start with ${lead}, patch the smallest surface, then prove it with focused Xcode evidence.`;
  }
  if (input.issueClass !== "apple-project-repair") {
    return `Apple evidence points toward ${input.issueClass}; collect source and focused proof before making broad changes.`;
  }
  return "No specific Apple repair class is proven yet; collect project context, source, and the shortest failing evidence first.";
}

function buildInspectionChecklist(
  issueClass: AppleRepairIssueClass,
  signals: string[]
): string[] {
  const checklist = new Set<string>();
  const add = (item: string) => checklist.add(item);

  if (issueClass === "swiftui-input-interaction" || signals.includes("input-focus")) {
    add(
      "Input child: TextField/TextEditor/SecureField label, binding, focus state, and identifier."
    );
    add(
      "Parent wrappers: ZStack, overlay, background, zIndex, allowsHitTesting, disabled state."
    );
    add(
      "Gesture/focus: broad tap handlers, highPriorityGesture, scroll containers, and FocusState conflicts."
    );
  }
  if (issueClass === "swiftui-hit-testing" || signals.includes("hit-testing")) {
    add(
      "Hit-test tree: visible element, actionable child, parent container identifier, and foreground window."
    );
    add(
      "Scroll proof: scroll anchor, lazy container state, hittable assertion, and blocking modal/sheet."
    );
  }
  if (issueClass === "swiftui-routing-state" || signals.includes("routing-state")) {
    add(
      "Routing action: selected tab/navigation path/sheet boolean and shared store mutation."
    );
    add(
      "Destination proof: assert the real screen/sheet appears, not only that the button exists."
    );
  }
  if (issueClass === "runtime-freeze" || signals.includes("runtime-proof")) {
    add("Runtime sample: Thread 0 first app-owned frame while frozen.");
    add(
      "Lifecycle code: View.body/init/onAppear/.task/App startup/shared stores for blocking work."
    );
  }
  if (issueClass === "xcode-build-repair" || signals.includes("xcode-build-proof")) {
    add(
      "Build line: missing member/symbol/label/type and the real declaration or target membership."
    );
  }
  if (issueClass === "ui-test-accessibility" || signals.includes("accessibility-tree")) {
    add(
      "Accessibility query: exact element type, identifier placement, label/value behavior, and parent masking."
    );
  }

  if (checklist.size === 0) {
    add(
      "Project context: recently changed Swift files, related parent shells, shared stores, and failing evidence."
    );
  }

  return Array.from(checklist).slice(0, 8);
}

function buildProofPlan(issueClass: AppleRepairIssueClass, fileName?: string): string[] {
  const source = fileName ?? "<changed Swift files>";
  const steps = [
    `Patch the smallest existing surface around ${source}.`,
    `Run \`axint validate-swift ${source}\`.`,
    `Run \`axint cloud check --source ${source}\` with expected/actual evidence.`,
  ];

  if (
    issueClass === "swiftui-input-interaction" ||
    issueClass === "swiftui-hit-testing" ||
    issueClass === "swiftui-routing-state" ||
    issueClass === "ui-test-accessibility"
  ) {
    steps.push(
      "Run one focused UI test that taps, types, scrolls, routes, or asserts the exact failing behavior."
    );
  }
  if (issueClass === "runtime-freeze") {
    steps.push(
      "Run launch/runtime proof and attach a short sample if the app still freezes."
    );
  }
  if (issueClass === "xcode-build-repair") {
    steps.push("Run the focused Xcode build that produced the original compiler error.");
  }

  steps.push(
    "Only claim fixed after the focused proof passes and Axint run records the evidence."
  );
  return steps;
}

function normalizeEvidence(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function hasAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}
