import { describe, expect, it } from "vitest";
import {
  renderActivationSmokeReport,
  runActivationSmokeTest,
} from "../../src/activation/smoke-test.js";

describe("axint activate", () => {
  it("runs the source-free compiler smoke test", () => {
    const report = runActivationSmokeTest();

    expect(report.status).toBe("ok");
    expect(report.signal).toBe("axint_activated");
    expect(report.intentName).toBe("AxintActivationProbe");
    expect(report.swiftFile).toBe("AxintActivationProbeIntent.swift");
    expect(report.swiftLines).toBeGreaterThan(0);
  });

  it("renders a concise activation receipt", () => {
    const output = renderActivationSmokeReport(runActivationSmokeTest(), "markdown");

    expect(output).toContain("# Axint Activation");
    expect(output).toContain("Status: ok");
    expect(output).toContain("Signal: axint_activated");
    expect(output).toContain("AxintActivationProbe");
  });
});
