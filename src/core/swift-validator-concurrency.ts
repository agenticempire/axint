/**
 * Swift 6 Concurrency Rules (AX720–AX734)
 *
 * These rules catch the fifteen most common Swift 6 strict-concurrency
 * mistakes: missing @MainActor on observable view models, retained
 * self inside Task closures, DispatchQueue holdovers that Swift 6
 * flags under strict concurrency, and the dozen other errors that
 * produce opaque "actor-isolated property can not be referenced" and
 * "type does not conform to Sendable" diagnostics in Xcode.
 *
 * Every rule here runs against the declaration list produced by
 * swift-ast.ts and an optional full-source pass for file-level patterns.
 */

import type { Diagnostic } from "./types.js";
import {
  type SwiftDeclaration,
  countNewlinesUpTo,
  hasAttribute,
  hasConformance,
  makeDiagnostic,
} from "./swift-ast.js";

export function checkConcurrency(
  decls: SwiftDeclaration[],
  source: string,
  file: string,
  diagnostics: Diagnostic[]
): void {
  checkDispatchMainAsync(source, file, diagnostics);
  checkDispatchGlobalAsync(source, file, diagnostics);

  for (const decl of decls) {
    checkObservableObjectMainActor(decl, file, diagnostics);
    checkObservableMainActor(decl, file, diagnostics);
    checkUncheckedSendable(decl, file, diagnostics);
    checkMainActorInActor(decl, file, diagnostics);
    checkLazyVarInActor(decl, file, diagnostics);
    checkNonisolatedVar(decl, file, diagnostics);
    checkSendableClassMustBeFinal(decl, file, diagnostics);
    checkAsyncFuncInView(decl, file, diagnostics);
    checkRedundantMainActorRun(decl, file, diagnostics);
    checkTaskCaptureSelf(decl, file, diagnostics);
    checkActorDeinit(decl, file, diagnostics);
    checkRedundantMainActorOnView(decl, file, diagnostics);
  }

  checkTaskDetached(source, file, diagnostics);
}

// ─── AX720 — DispatchQueue.main.async → Task { @MainActor in } ──────

function checkDispatchMainAsync(source: string, file: string, diagnostics: Diagnostic[]) {
  const re = /\bDispatchQueue\.main\.async\s*(?:\(\s*execute\s*:\s*)?\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    diagnostics.push(
      makeDiagnostic("AX720", file, 1 + countNewlinesUpTo(source, m.index), {
        message:
          "DispatchQueue.main.async is discouraged under Swift 6 — use Task { @MainActor in }",
        suggestion:
          "Replace with: Task { @MainActor in ... } — compiler will enforce isolation.",
      })
    );
  }
}

// ─── AX734 — DispatchQueue.global().async → Task.detached { } ───────

function checkDispatchGlobalAsync(
  source: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const re = /\bDispatchQueue\.global\([^)]*\)\.async\s*(?:\(\s*execute\s*:\s*)?\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    diagnostics.push(
      makeDiagnostic("AX734", file, 1 + countNewlinesUpTo(source, m.index), {
        message:
          "DispatchQueue.global().async is discouraged under Swift 6 — use Task.detached { }",
        suggestion:
          "Replace with: Task.detached { ... } — inherits no isolation context.",
      })
    );
  }
}

// ─── AX721 — ObservableObject class needs @MainActor ─────────────────

function checkObservableObjectMainActor(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "class") return;
  if (!hasConformance(decl, "ObservableObject")) return;
  if (hasAttribute(decl, "@MainActor")) return;
  diagnostics.push(
    makeDiagnostic("AX721", file, decl.startLine, {
      message: `ObservableObject '${decl.name}' should be annotated @MainActor`,
      suggestion:
        "Add @MainActor above the class. UI-facing view models must publish on the main actor under Swift 6.",
    })
  );
}

// ─── AX722 — @Observable class with @Published-ish state needs @MainActor ─

function checkObservableMainActor(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "class") return;
  if (!hasAttribute(decl, "@Observable")) return;
  if (hasAttribute(decl, "@MainActor")) return;
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  // Heuristic: any stored var qualifies as UI state.
  if (!/\bvar\s+\w+\b/.test(body)) return;
  diagnostics.push(
    makeDiagnostic("AX722", file, decl.startLine, {
      message: `@Observable class '${decl.name}' with mutable state should be annotated @MainActor`,
      suggestion:
        "Add @MainActor above the class to isolate mutation to the main thread.",
    })
  );
}

// ─── AX723 — @unchecked Sendable warning ─────────────────────────────

function checkUncheckedSendable(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const header = decl.source.slice(Math.max(0, decl.bodyStart - 300), decl.bodyStart + 1);
  if (!/@unchecked\s+Sendable/.test(header)) return;
  diagnostics.push(
    makeDiagnostic("AX723", file, decl.startLine, {
      message: `'${decl.name}' uses @unchecked Sendable — the compiler is trusting you blindly`,
      suggestion:
        "Prefer real Sendable conformance. If you must use @unchecked, add a comment explaining the invariant you're manually upholding.",
    })
  );
}

// ─── AX724 — @MainActor inside an actor is redundant ─────────────────

function checkMainActorInActor(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "actor") return;
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const re = /@MainActor\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const line = decl.startLine + countNewlinesUpTo(body, m.index);
    diagnostics.push(
      makeDiagnostic("AX724", file, line, {
        message: `@MainActor inside actor '${decl.name}' conflicts with actor isolation`,
        suggestion:
          "Remove @MainActor. An actor has its own isolation domain — mixing it with @MainActor is an error under Swift 6.",
      })
    );
  }
}

// ─── AX725 — lazy var is not allowed in an actor ─────────────────────

function checkLazyVarInActor(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "actor") return;
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const re = /\blazy\s+var\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const line = decl.startLine + countNewlinesUpTo(body, m.index);
    diagnostics.push(
      makeDiagnostic("AX725", file, line, {
        message: `'lazy var' is not permitted inside actor '${decl.name}'`,
        suggestion:
          "Replace with a regular var initialized in the actor's init, or compute on-demand via a func.",
      })
    );
  }
}

// ─── AX727 — nonisolated var must be let ─────────────────────────────

function checkNonisolatedVar(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const re = /\bnonisolated\s+var\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const line = decl.startLine + countNewlinesUpTo(body, m.index);
    diagnostics.push(
      makeDiagnostic("AX727", file, line, {
        message: `nonisolated var '${m[1]}' in '${decl.name}' must be 'let'`,
        suggestion:
          "Change 'var' to 'let'. nonisolated stored properties have to be immutable to be Sendable.",
      })
    );
  }
}

// ─── AX728 — Sendable class must be final ────────────────────────────

function checkSendableClassMustBeFinal(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "class") return;
  if (!hasConformance(decl, "Sendable")) return;
  if (decl.attributes.includes("final")) return;
  diagnostics.push(
    makeDiagnostic("AX728", file, decl.startLine, {
      message: `Sendable class '${decl.name}' must be declared 'final'`,
      suggestion:
        "Add 'final' before 'class'. Non-final classes can't be Sendable because subclasses could add mutable state.",
    })
  );
}

// ─── AX729 — async func inside a View struct ────────────────────────

function checkAsyncFuncInView(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "struct") return;
  if (!hasConformance(decl, "View")) return;
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const re = /\bfunc\s+(\w+)\s*\([^)]*\)\s*async\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1] === "body") continue;
    const line = decl.startLine + countNewlinesUpTo(body, m.index);
    diagnostics.push(
      makeDiagnostic("AX729", file, line, {
        message: `async func '${m[1]}' in View '${decl.name}' can't be called from body`,
        suggestion: "Move async work into .task { } or .onAppear { Task { ... } }.",
      })
    );
  }
}

// ─── AX730 — Redundant await MainActor.run inside @MainActor ────────

function checkRedundantMainActorRun(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const mainActorCtx =
    hasAttribute(decl, "@MainActor") ||
    (decl.kind === "struct" && hasConformance(decl, "View"));
  if (!mainActorCtx) return;
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const re = /\bawait\s+MainActor\.run\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const line = decl.startLine + countNewlinesUpTo(body, m.index);
    diagnostics.push(
      makeDiagnostic("AX730", file, line, {
        message: `Redundant 'await MainActor.run' inside @MainActor context in '${decl.name}'`,
        suggestion: "Remove the wrapper — the code is already on the main actor.",
      })
    );
  }
}

// ─── AX731 — Task { self } should use [weak self] ───────────────────

function checkTaskCaptureSelf(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "class") return;
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const re = /\bTask\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    // Position of the opening brace.
    const braceIdx = m.index + m[0].length - 1;
    const closeBrace = findClosureEnd(body, braceIdx);
    if (closeBrace === -1) continue;
    const closureBody = body.slice(braceIdx + 1, closeBrace);
    // Skip if the capture list already has [weak self] or [unowned self].
    if (/^\s*\[\s*(weak|unowned)\s+self\b/.test(closureBody)) continue;
    if (!/\bself\b/.test(closureBody)) continue;
    const line = decl.startLine + countNewlinesUpTo(body, m.index);
    diagnostics.push(
      makeDiagnostic("AX731", file, line, {
        message: `Task in class '${decl.name}' captures self without [weak self]`,
        suggestion: "Use Task { [weak self] in guard let self else { return } ... }",
      })
    );
  }
}

function findClosureEnd(source: string, openBraceIdx: number): number {
  let depth = 0;
  for (let i = openBraceIdx; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ─── AX732 — actor deinit touching isolated state ───────────────────

function checkActorDeinit(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "actor") return;
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const m = /\bdeinit\s*\{/.exec(body);
  if (!m) return;
  const end = findClosureEnd(body, m.index + m[0].length - 1);
  if (end === -1) return;
  const deinitBody = body.slice(m.index, end);
  if (
    /\bself\.\w+/.test(deinitBody) ||
    /(?<![\w.])\w+\s*=/.test(deinitBody.slice(m[0].length))
  ) {
    const line = decl.startLine + countNewlinesUpTo(body, m.index);
    diagnostics.push(
      makeDiagnostic("AX732", file, line, {
        message: `actor '${decl.name}' deinit accesses actor-isolated state`,
        suggestion:
          "Move cleanup to a dedicated async close() method — deinit cannot await.",
      })
    );
  }
}

// ─── AX733 — Redundant @MainActor on View struct ────────────────────

function checkRedundantMainActorOnView(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (decl.kind !== "struct") return;
  if (!hasConformance(decl, "View")) return;
  if (!hasAttribute(decl, "@MainActor")) return;
  diagnostics.push(
    makeDiagnostic("AX733", file, decl.startLine, {
      message: `@MainActor on View '${decl.name}' is redundant — SwiftUI views are already main-actor isolated`,
      suggestion: "Remove @MainActor. SwiftUI views inherit main-actor isolation.",
    })
  );
}

// ─── AX726 — Task.detached loses context ────────────────────────────

function checkTaskDetached(source: string, file: string, diagnostics: Diagnostic[]) {
  const re = /\bTask\.detached\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    diagnostics.push(
      makeDiagnostic("AX726", file, 1 + countNewlinesUpTo(source, m.index), {
        message:
          "Task.detached loses the current actor isolation — double-check this is intentional",
        suggestion:
          "If you need main-actor work, use Task { @MainActor in ... }. If you want background work, keep Task.detached but add a comment.",
      })
    );
  }
}
