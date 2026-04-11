# Axint Compile-Time Benchmarks

This directory contains Vitest benchmarks that measure the compilation performance of the Axint compiler across all 4 compilation surfaces.

## What's Measured

- **Intent** — Compiling App Intent definitions with parameter validation
- **View** — Compiling SwiftUI view definitions with state and conditional rendering
- **Widget** — Compiling WidgetKit widget definitions with timeline entries
- **App** — Compiling SwiftUI App definitions with scenes and storage

Each benchmark compiles a representative sample fixture 100 times and reports throughput metrics.

## Running Benchmarks

Run benchmarks locally:

```bash
npm run bench
```

With verbose output:

```bash
npm run bench -- --reporter=verbose
```

Benchmarks run automatically in CI and are reported on pull requests.

## Benchmark Results

Results appear in CI logs and can be viewed after each run. Benchmarks help catch unexpected performance regressions in codegen and validation.
