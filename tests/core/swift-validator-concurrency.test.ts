import { describe, it, expect } from "vitest";
import { validateSwiftSource } from "../../src/core/swift-validator.js";
import { fixSwiftSource } from "../../src/core/swift-fixer.js";

function validate(source: string) {
  return validateSwiftSource(source, "test.swift");
}

describe("swift concurrency — AX720 DispatchQueue.main.async", () => {
  it("flags DispatchQueue.main.async as discouraged", () => {
    const source = `
      func refresh() {
          DispatchQueue.main.async {
              print("refreshed")
          }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX720");
  });

  it("rewrites DispatchQueue.main.async to Task { @MainActor in }", () => {
    const source = `DispatchQueue.main.async { print("hi") }`;
    const { source: fixed, fixed: applied } = fixSwiftSource(source, "test.swift");
    expect(applied.map((d) => d.code)).toContain("AX720");
    expect(fixed).toContain("Task { @MainActor in");
    expect(fixed).not.toContain("DispatchQueue.main.async");
  });
});

describe("swift concurrency — AX721 ObservableObject needs @MainActor", () => {
  it("flags a bare ObservableObject class", () => {
    const source = `
      class UserModel: ObservableObject {
          @Published var name = ""
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX721");
  });

  it("accepts @MainActor ObservableObject", () => {
    const source = `
      @MainActor
      class UserModel: ObservableObject {
          @Published var name = ""
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX721")).toHaveLength(
      0
    );
  });

  it("adds @MainActor when fixing", () => {
    const source = `class UserModel: ObservableObject {\n    var name = ""\n}`;
    const { source: fixed } = fixSwiftSource(source, "test.swift");
    expect(fixed).toContain("@MainActor");
  });
});

describe("swift concurrency — AX722 @Observable needs @MainActor", () => {
  it("flags a bare @Observable class with mutable state", () => {
    const source = `
      @Observable
      class Counter {
          var count = 0
      }
    `;
    const { diagnostics } = validate(source);
    const diagnostic = diagnostics.find((d) => d.code === "AX722");
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.severity).toBe("warning");
  });

  it("accepts @MainActor @Observable", () => {
    const source = `
      @MainActor
      @Observable
      class Counter {
          var count = 0
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX722")).toHaveLength(
      0
    );
  });
});

describe("swift concurrency — AX723 @unchecked Sendable", () => {
  it("warns on @unchecked Sendable", () => {
    const source = `
      final class Cache: @unchecked Sendable {
          var items: [String] = []
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.some((d) => d.code === "AX723")).toBe(true);
  });
});

describe("swift concurrency — AX724 @MainActor inside actor", () => {
  it("flags @MainActor methods inside an actor", () => {
    const source = `
      actor Store {
          @MainActor func reload() {}
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX724");
  });
});

describe("swift concurrency — AX725 lazy var in actor", () => {
  it("flags lazy var inside an actor", () => {
    const source = `
      actor Store {
          lazy var items: [Int] = []
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX725");
  });
});

describe("swift concurrency — AX726 Task.detached", () => {
  it("warns on Task.detached", () => {
    const source = `
      func run() {
          Task.detached {
              print("bg")
          }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX726");
  });
});

describe("swift concurrency — AX727 nonisolated var", () => {
  it("flags nonisolated var", () => {
    const source = `
      actor Store {
          nonisolated var name: String = ""
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX727");
  });

  it("rewrites nonisolated var to nonisolated let", () => {
    const source = `actor Store {\n    nonisolated var name: String = ""\n}`;
    const { source: fixed } = fixSwiftSource(source, "test.swift");
    expect(fixed).toContain("nonisolated let name");
  });
});

describe("swift concurrency — AX728 Sendable class must be final", () => {
  it("flags non-final Sendable class", () => {
    const source = `class Box: Sendable { let value = 1 }`;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX728");
  });

  it("accepts final Sendable class", () => {
    const source = `final class Box: Sendable { let value = 1 }`;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX728")).toHaveLength(
      0
    );
  });

  it("adds final when fixing", () => {
    const source = `class Box: Sendable { let value = 1 }`;
    const { source: fixed } = fixSwiftSource(source, "test.swift");
    expect(fixed).toContain("final class Box");
  });
});

describe("swift concurrency — AX729 async func in View", () => {
  it("flags async func inside a View struct", () => {
    const source = `
      struct Content: View {
          var body: some View { Text("hi") }
          func load() async {}
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX729");
  });
});

describe("swift concurrency — AX730 redundant MainActor.run", () => {
  it("flags redundant MainActor.run inside a View", () => {
    const source = `
      struct Content: View {
          var body: some View { Text("hi") }
          func reload() {
              Task {
                  await MainActor.run { print("now") }
              }
          }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX730");
  });
});

describe("swift concurrency — AX731 Task captures self", () => {
  it("flags Task { self } without [weak self]", () => {
    const source = `
      class Client {
          func run() {
              Task {
                  self.log("go")
              }
          }
          func log(_ msg: String) {}
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX731");
  });

  it("accepts Task { [weak self] in }", () => {
    const source = `
      class Client {
          func run() {
              Task { [weak self] in
                  self?.log("go")
              }
          }
          func log(_ msg: String) {}
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX731")).toHaveLength(
      0
    );
  });

  it("accepts Task { @MainActor [weak self] in }", () => {
    const source = `
      class Client {
          func run() {
              Task { @MainActor [weak self] in
                  self?.log("go")
              }
          }
          func log(_ msg: String) {}
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX731")).toHaveLength(
      0
    );
  });

  it("still flags Task { @MainActor in self } without a weak capture", () => {
    const source = `
      class Client {
          func run() {
              Task { @MainActor in
                  self.log("go")
              }
          }
          func log(_ msg: String) {}
      }
    `;
    expect(validate(source).diagnostics.map((d) => d.code)).toContain("AX731");
  });
});

describe("swift concurrency — AX733 redundant @MainActor on View", () => {
  it("flags @MainActor on a View struct", () => {
    const source = `
      @MainActor
      struct Content: View {
          var body: some View { Text("hi") }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX733");
  });

  it("strips @MainActor when fixing", () => {
    const source = `@MainActor\nstruct Content: View {\n    var body: some View { Text("hi") }\n}`;
    const { source: fixed } = fixSwiftSource(source, "test.swift");
    expect(fixed).not.toContain("@MainActor");
  });
});

describe("swift concurrency — AX734 DispatchQueue.global().async", () => {
  it("flags DispatchQueue.global().async", () => {
    const source = `DispatchQueue.global().async { print("bg") }`;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX734");
  });

  it("rewrites to Task.detached", () => {
    const source = `DispatchQueue.global().async { print("bg") }`;
    const { source: fixed } = fixSwiftSource(source, "test.swift");
    expect(fixed).toContain("Task.detached {");
  });
});
