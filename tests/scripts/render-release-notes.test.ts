import { describe, expect, it } from "vitest";
import {
  extractChangelogSection,
  renderReleaseBody,
} from "../../scripts/render-release-notes.js";

const changelog = `# Changelog

## [Unreleased]

## [1.2.3] - 2026-07-13

### Added

- A release-specific capability.

### Why this matters

- It closes a real workflow gap.

## [1.2.2] - 2026-07-12

### Fixed

- An older fix.
`;

describe("release note rendering", () => {
  it("extracts only the requested changelog section", () => {
    const section = extractChangelogSection(changelog, "1.2.3");

    expect(section).toContain("A release-specific capability");
    expect(section).toContain("Why this matters");
    expect(section).not.toContain("An older fix");
  });

  it("adds both install commands and the matching changelog link", () => {
    const body = renderReleaseBody(changelog, "1.2.3");

    expect(body).toContain("npm install -g @axint/compiler");
    expect(body).toContain("pip install axint");
    expect(body).toContain("CHANGELOG.md");
  });

  it("fails when the release is absent", () => {
    expect(() => extractChangelogSection(changelog, "9.9.9")).toThrow(
      "CHANGELOG.md has no release section for 9.9.9"
    );
  });
});
