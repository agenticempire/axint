# Brownfield precision benchmark

This is a small, curated regression corpus. It proves the listed cases and nothing broader.

- Corpus: 1.0.0
- Cases: 8 (2 clean, 6 with labeled findings)
- Precision: 100.0%
- Recall: 100.0%
- Clean-case abstention: 100.0%
- False positives: 0
- False negatives: 0

| Case | Expected | Emitted | Result |
| --- | --- | --- | --- |
| Ordinary compiling SwiftUI view | abstain | abstain | pass |
| Complete App Intent | abstain | abstain | pass |
| Container identifier can hide child identifiers | AX736 | AX736 | pass |
| Text input overlay without hit-testing policy | AX764 | AX764 | pass |
| Invalid SwiftUI frame overload | AX765 | AX765 | pass |
| View without SwiftUI import | AX718 | AX718 | pass |
| View body references an undeclared property | AX739 | AX739 | pass |
| UI ObservableObject without explicit isolation | AX721 | AX721 | pass |
