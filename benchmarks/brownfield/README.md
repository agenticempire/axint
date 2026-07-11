# Brownfield precision benchmark

This is a transparent labeled corpus, not a production-wide accuracy claim. Published artifacts contain fixture hashes, labels, and results, but no Swift source.

- Corpus: Axint curated brownfield regression corpus 2.0.0
- Cases: 20 (8 clean, 12 with labeled findings)
- Categories: accessibility, app-intents, concurrency, interaction, swiftui, uikit, widgetkit
- Precision: 100.0%
- Recall: 100.0%
- Clean-case abstention: 100.0%
- False-positive rate: 0.0%
- Release thresholds: pass

## Category results

| Category | Cases | Precision | Recall | Clean abstention |
| --- | ---: | ---: | ---: | ---: |
| accessibility | 1 | 100.0% | 100.0% | n/a |
| app-intents | 2 | 100.0% | 100.0% | 100.0% |
| concurrency | 6 | 100.0% | 100.0% | 100.0% |
| interaction | 2 | 100.0% | 100.0% | 100.0% |
| swiftui | 6 | 100.0% | 100.0% | 100.0% |
| uikit | 1 | n/a | n/a | 100.0% |
| widgetkit | 2 | 100.0% | 100.0% | n/a |

## Cases

| Case | Surface | Expected | Emitted | Result |
| --- | --- | --- | --- | --- |
| Ordinary compiling SwiftUI view | swiftui | abstain | abstain | pass |
| Complete App Intent | app-intents | abstain | abstain | pass |
| Container identifier can hide child identifiers | accessibility | AX736 | AX736 | pass |
| Text input overlay without hit-testing policy | interaction | AX764 | AX764 | pass |
| Invalid SwiftUI frame overload | swiftui | AX765 | AX765 | pass |
| View without SwiftUI import | swiftui | AX718 | AX718 | pass |
| View body references an undeclared property | swiftui | AX739 | AX739 | pass |
| UI ObservableObject without explicit isolation | concurrency | AX721 | AX721 | pass |
| Ordinary UIKit view controller | uikit | abstain | abstain | pass |
| Explicitly isolated observable model | concurrency | abstain | abstain | pass |
| Actor with immutable nonisolated identifier | concurrency | abstain | abstain | pass |
| Decorative input overlay disables hit testing | interaction | abstain | abstain | pass |
| Valid split SwiftUI frame modifiers | swiftui | abstain | abstain | pass |
| Immutable Sendable value | concurrency | abstain | abstain | pass |
| App Intent missing perform | app-intents | AX701 | AX701 | pass |
| SwiftUI State declared as let | swiftui | AX703 | AX703 | pass |
| Widget missing configuration body | widgetkit | AX702 | AX702 | pass |
| Timeline entry missing date | widgetkit | AX713 | AX713 | pass |
| Unchecked Sendable reference type | concurrency | AX723 | AX723 | pass |
| Detached task loses actor context | concurrency | AX726 | AX726 | pass |

## Reproduce

`npm run benchmark:brownfield:check`

To evaluate an opt-in private corpus without publishing source, pass a local manifest:

`npm run benchmark:brownfield -- --corpus /path/to/corpus.json --out /tmp/axint-benchmark.json`
