/**
 * Axint View Validator
 *
 * Validates IRView for SwiftUI framework compliance.
 * Diagnostic codes: AX300–AX399 (view-specific).
 */

import type { Diagnostic, IRView, ViewBodyNode } from "./types.js";

/**
 * Validate an IRView for SwiftUI compliance.
 */
export function validateView(view: IRView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // AX310: View name must be PascalCase
  if (!view.name || !/^[A-Z][a-zA-Z0-9]*$/.test(view.name)) {
    diagnostics.push({
      code: "AX310",
      severity: "error",
      message: `View name "${view.name}" must be PascalCase (e.g., "ProfileCard")`,
      file: view.sourceFile,
      suggestion: `Rename to "${toPascalCase(view.name)}"`,
    });
  }

  // AX311: View must have a non-empty body
  if (!view.body || view.body.length === 0) {
    diagnostics.push({
      code: "AX311",
      severity: "error",
      message: "View must have at least one body element",
      file: view.sourceFile,
      suggestion: "Add elements to the body array: body: [view.text('Hello')]",
    });
  }

  // AX312: Prop names must be valid Swift identifiers
  const propNames = new Set<string>();
  for (const p of view.props) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p.name)) {
      diagnostics.push({
        code: "AX312",
        severity: "error",
        message: `Prop name "${p.name}" is not a valid Swift identifier`,
        file: view.sourceFile,
      });
    }
    if (propNames.has(p.name)) {
      diagnostics.push({
        code: "AX313",
        severity: "error",
        message: `Duplicate prop name "${p.name}"`,
        file: view.sourceFile,
      });
    }
    propNames.add(p.name);
  }

  // AX314: State names must be valid Swift identifiers and not collide with props
  for (const s of view.state) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s.name)) {
      diagnostics.push({
        code: "AX314",
        severity: "error",
        message: `State name "${s.name}" is not a valid Swift identifier`,
        file: view.sourceFile,
      });
    }
    if (propNames.has(s.name)) {
      diagnostics.push({
        code: "AX315",
        severity: "error",
        message: `State name "${s.name}" conflicts with a prop of the same name`,
        file: view.sourceFile,
        suggestion: "Props and state properties must have unique names within a view",
      });
    }
  }

  // AX316: @Environment state must have an environmentKey
  for (const s of view.state) {
    if (s.kind === "environment" && !s.environmentKey) {
      diagnostics.push({
        code: "AX316",
        severity: "warning",
        message: `Environment state "${s.name}" has no environmentKey — will use \\.${s.name} by default`,
        file: view.sourceFile,
        suggestion: 'Set environmentKey: "\\.dismiss" to specify the Environment keypath',
      });
    }
  }

  // AX317: @State properties should have a default value
  for (const s of view.state) {
    if (s.kind === "state" && s.defaultValue === undefined) {
      diagnostics.push({
        code: "AX317",
        severity: "warning",
        message: `@State property "${s.name}" has no default value — Swift requires @State to be initialized`,
        file: view.sourceFile,
        suggestion: "Add a default: state.int('...', { default: 0 })",
      });
    }
  }

  // Validate body nodes recursively
  for (const node of view.body) {
    diagnostics.push(...validateBodyNode(node, view.sourceFile));
  }

  return diagnostics;
}

function validateBodyNode(node: ViewBodyNode, sourceFile: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  switch (node.kind) {
    case "vstack":
    case "hstack":
    case "zstack":
      for (const child of node.children) {
        diagnostics.push(...validateBodyNode(child, sourceFile));
      }
      break;

    case "foreach":
      if (!node.collection) {
        diagnostics.push({
          code: "AX318",
          severity: "error",
          message: "ForEach requires a collection expression",
          file: sourceFile,
        });
      }
      for (const child of node.body) {
        diagnostics.push(...validateBodyNode(child, sourceFile));
      }
      break;

    case "conditional":
      if (!node.condition) {
        diagnostics.push({
          code: "AX319",
          severity: "error",
          message: "Conditional requires a condition expression",
          file: sourceFile,
        });
      }
      for (const child of node.then) {
        diagnostics.push(...validateBodyNode(child, sourceFile));
      }
      if (node.else) {
        for (const child of node.else) {
          diagnostics.push(...validateBodyNode(child, sourceFile));
        }
      }
      break;

    case "navigationLink":
      for (const child of node.label) {
        diagnostics.push(...validateBodyNode(child, sourceFile));
      }
      break;

    case "list":
      for (const child of node.children) {
        diagnostics.push(...validateBodyNode(child, sourceFile));
      }
      break;
  }

  return diagnostics;
}

function toPascalCase(s: string): string {
  if (!s) return "UnnamedView";
  return s
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

/**
 * Validate generated SwiftUI source code for basic correctness.
 */
export function validateSwiftUISource(swift: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!swift.includes("import SwiftUI")) {
    diagnostics.push({
      code: "AX320",
      severity: "error",
      message: 'Generated Swift is missing "import SwiftUI"',
    });
  }

  if (!swift.includes(": View")) {
    diagnostics.push({
      code: "AX321",
      severity: "error",
      message: "Generated struct does not conform to View protocol",
    });
  }

  if (!swift.includes("var body: some View")) {
    diagnostics.push({
      code: "AX322",
      severity: "error",
      message: "Generated struct is missing the body computed property",
    });
  }

  return diagnostics;
}
