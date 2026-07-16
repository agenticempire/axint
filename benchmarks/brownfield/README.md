# Brownfield precision benchmark

This is a transparent labeled corpus, not a production-wide accuracy claim. Published artifacts contain fixture hashes, labels, and results, but no Swift source.

- Corpus: Axint curated brownfield regression corpus 3.0.0
- Cases: 38 (17 clean, 21 with labeled findings)
- Categories: accessibility, app-intents, background-assets, concurrency, documents, foundation-models, interaction, swiftui, uikit, widgetkit
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
| background-assets | 2 | 100.0% | 100.0% | 100.0% |
| concurrency | 6 | 100.0% | 100.0% | 100.0% |
| documents | 4 | 100.0% | 100.0% | 100.0% |
| foundation-models | 2 | 100.0% | 100.0% | 100.0% |
| interaction | 6 | 100.0% | 100.0% | 100.0% |
| swiftui | 12 | 100.0% | 100.0% | 100.0% |
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
| State macro declaration and init assignment conflict | swiftui | AX861 | AX861 | pass |
| State macro initializer assigns uninitialized state | swiftui | abstain | abstain | pass |
| Deprecated FileDocument conformance | documents | AX863 | AX863 | pass |
| Current Document conformance | documents | abstain | abstain | pass |
| Legacy nonisolated document reader | documents | AX864 | AX864 | pass |
| Current concurrent document reader | documents | abstain | abstain | pass |
| Pre-27 toolbar minimization spelling | swiftui | AX865 | AX865 | pass |
| Current toolbar minimization spelling | swiftui | abstain | abstain | pass |
| Soft-deprecated text field style | swiftui | AX866 | AX866 | pass |
| Current bordered text field style | swiftui | abstain | abstain | pass |
| Deprecated On Demand Resources request | background-assets | AX867 | AX867 | pass |
| Background Assets download declaration | background-assets | abstain | abstain | pass |
| Private Cloud model without sampling options | foundation-models | AX868 | AX868 | pass |
| Private Cloud model with seeded sampling | foundation-models | abstain | abstain | pass |
| Selectable text with competing gesture | interaction | AX869 | AX869 | pass |
| Selectable text with explicit high-priority gesture | interaction | abstain | abstain | pass |
| Selected TabView contains a hidden tab path | interaction | AX870 | AX870 | pass |
| Selected TabView contains only visible tabs | interaction | abstain | abstain | pass |

## Reproduce

`npm run benchmark:brownfield:check`

To evaluate an opt-in private corpus without publishing source, pass a local manifest:

`npm run benchmark:brownfield -- --corpus /path/to/corpus.json --out /tmp/axint-benchmark.json`
