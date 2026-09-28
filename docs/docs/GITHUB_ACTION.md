# Axint proof gate for GitHub Actions

Run on a **macOS** runner with Xcode installed. Axint uses local Xcode build/test evidence; a Linux runner cannot establish an Apple build verdict. The action does not change Swift, upload source, or apply fixes.

```yaml
name: Axint proof
on: [pull_request]
jobs:
  prove:
    runs-on: macos-15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Prove the app
        id: axint
        uses: agenticempire/axint@vNEXT # replace with the release tag that includes action.yml
        with:
          directory: .
          scheme: MyApp
          destination: 'platform=macOS'
          strict: 'true'
      - name: Keep the receipt
        if: always() && steps.axint.outputs.receipt != ''
        uses: actions/upload-artifact@v4
        with:
          name: axint-proof
          path: ${{ steps.axint.outputs.receipt }}
```

The action outputs `status`, `verdict`, and the local signed receipt path. Strict mode (default) fails the job on `needs_review` as well as `fail`; without strict mode, only `fail` produces a nonzero exit code. Choose the scheme and destination for the project; Axint can infer a scheme when unambiguous. The receipt contains no source code, but review its metadata and your repository's artifact-retention policy before uploading it. A locally signed receipt proves integrity, not team identity, unless the signer fingerprint or managed key is pinned.

Use a pinned release tag after the action has been included in that release. Do not reference `@v0.6.0`: that tag predates this action. The Marketplace listing should be published only after the release ships and a macOS fixture run passes.
