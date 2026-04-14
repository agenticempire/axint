// LintVisitor — SwiftSyntax walker that checks a handful of Axint rules
// the regex validator can't cleanly express. Start small: two rules that
// have been a source of false positives in the TS validator, prove the
// round-trip, then port more as they pay for themselves.
//
// Rules implemented:
//   AX701 — AppIntent conformance without a perform() function
//   AX727 — nonisolated stored property declared with `var`
//
// Each rule owns its own logic in this file. If we add a third rule it
// graduates to its own file under Rules/.

import SwiftSyntax

final class LintVisitor: SyntaxVisitor {
    private let locations: SourceLocationConverter
    private let report: (Diagnostic) -> Void

    init(locations: SourceLocationConverter, report: @escaping (Diagnostic) -> Void) {
        self.locations = locations
        self.report = report
        super.init(viewMode: .sourceAccurate)
    }

    override func visit(_ node: StructDeclSyntax) -> SyntaxVisitorContinueKind {
        if conforms(to: "AppIntent", in: node.inheritanceClause) {
            checkAppIntentPerform(node)
        }
        return .visitChildren
    }

    override func visit(_ node: VariableDeclSyntax) -> SyntaxVisitorContinueKind {
        checkNonisolatedVar(node)
        return .visitChildren
    }

    // ─── AX701 ──────────────────────────────────────────────────────────

    private func checkAppIntentPerform(_ node: StructDeclSyntax) {
        let hasPerform = node.memberBlock.members.contains { member in
            guard let fn = member.decl.as(FunctionDeclSyntax.self) else { return false }
            return fn.name.text == "perform"
        }
        if hasPerform { return }

        let position = locations.location(for: node.name.positionAfterSkippingLeadingTrivia)
        report(
            Diagnostic(
                code: "AX701",
                severity: .error,
                line: position.line,
                column: position.column,
                message:
                    "AppIntent \(node.name.text) is missing a perform() function. Add `func perform() async throws -> some IntentResult`."
            )
        )
    }

    // ─── AX727 ──────────────────────────────────────────────────────────

    private func checkNonisolatedVar(_ node: VariableDeclSyntax) {
        let isNonisolated = node.modifiers.contains { modifier in
            modifier.name.tokenKind == .keyword(.nonisolated)
        }
        guard isNonisolated, node.bindingSpecifier.tokenKind == .keyword(.var) else { return }

        // Accept `var` when there's a computed getter — those can be nonisolated safely.
        let isComputed = node.bindings.contains { binding in
            binding.accessorBlock != nil
        }
        if isComputed { return }

        let position = locations.location(for: node.bindingSpecifier.positionAfterSkippingLeadingTrivia)
        report(
            Diagnostic(
                code: "AX727",
                severity: .error,
                line: position.line,
                column: position.column,
                message:
                    "nonisolated stored properties must be immutable. Change `var` to `let` or move the state into an actor."
            )
        )
    }

    // ─── helpers ────────────────────────────────────────────────────────

    private func conforms(to name: String, in clause: InheritanceClauseSyntax?) -> Bool {
        guard let clause else { return false }
        return clause.inheritedTypes.contains { inherited in
            inherited.type.trimmedDescription == name
        }
    }
}
