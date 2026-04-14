import { describe, it, expect } from "vitest";
import { validateSwiftSource } from "../../src/core/swift-validator.js";
import { fixSwiftSource } from "../../src/core/swift-fixer.js";

function validate(source: string) {
  return validateSwiftSource(source, "test.swift");
}

describe("live activities — AX740 ActivityAttributes needs ContentState", () => {
  it("flags ActivityAttributes without a nested ContentState", () => {
    const source = `
      import ActivityKit
      struct DeliveryAttributes: ActivityAttributes {
          let orderID: String
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX740");
  });

  it("accepts ActivityAttributes with ContentState", () => {
    const source = `
      import ActivityKit
      struct DeliveryAttributes: ActivityAttributes {
          struct ContentState: Codable, Hashable {
              var progress: Double
          }
          let orderID: String
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX740")).toHaveLength(
      0
    );
  });

  it("injects ContentState when fixing", () => {
    const source = `import ActivityKit\nstruct DeliveryAttributes: ActivityAttributes {\n    let orderID: String\n}`;
    const { source: fixed } = fixSwiftSource(source, "test.swift");
    expect(fixed).toContain("struct ContentState");
    expect(fixed).toContain("Codable");
    expect(fixed).toContain("Hashable");
  });
});

describe("live activities — AX741/AX742 ContentState conformances", () => {
  it("flags ContentState missing Codable", () => {
    const source = `
      import ActivityKit
      struct DeliveryAttributes: ActivityAttributes {
          struct ContentState: Hashable {
              var progress: Double
          }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX741");
  });

  it("flags ContentState missing Hashable", () => {
    const source = `
      import ActivityKit
      struct DeliveryAttributes: ActivityAttributes {
          struct ContentState: Codable {
              var progress: Double
          }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX742");
  });

  it("adds missing conformances when fixing", () => {
    const source = `
      import ActivityKit
      struct DeliveryAttributes: ActivityAttributes {
          struct ContentState {
              var progress: Double
          }
      }
    `;
    const { source: fixed } = fixSwiftSource(source, "test.swift");
    expect(fixed).toMatch(/ContentState:\s*Codable,\s*Hashable/);
  });
});

describe("live activities — AX743 ActivityConfiguration dynamicIsland", () => {
  it("flags ActivityConfiguration missing dynamicIsland", () => {
    const source = `
      import ActivityKit
      struct DeliveryLiveActivity: Widget {
          var body: some WidgetConfiguration {
              ActivityConfiguration(for: DeliveryAttributes.self) { context in
                  Text("hi")
              }
          }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX743");
  });
});

describe("live activities — AX744–AX747 DynamicIsland regions", () => {
  it("flags a DynamicIsland missing compactLeading/compactTrailing/minimal", () => {
    const source = `
      DynamicIsland {
          // no regions yet
      }
    `;
    const { diagnostics } = validate(source);
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain("AX745");
    expect(codes).toContain("AX746");
    expect(codes).toContain("AX747");
  });

  it("accepts a DynamicIsland with all three compact regions", () => {
    const source = `
      DynamicIsland {
          compactLeading { Image(systemName: "box") }
          compactTrailing { Text("2m") }
          minimal { Image(systemName: "dot") }
      }
    `;
    const codes = validate(source).diagnostics.map((d) => d.code);
    expect(codes).not.toContain("AX745");
    expect(codes).not.toContain("AX746");
    expect(codes).not.toContain("AX747");
  });
});

describe("live activities — AX748 missing ActivityKit import", () => {
  it("flags file that uses ActivityAttributes without import", () => {
    const source = `
      struct DeliveryAttributes: ActivityAttributes {
          struct ContentState: Codable, Hashable {
              var progress: Double
          }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX748");
  });

  it("adds import ActivityKit when fixing", () => {
    const source = `import SwiftUI\nstruct DeliveryAttributes: ActivityAttributes {\n    struct ContentState: Codable, Hashable { var progress: Double }\n}`;
    const { source: fixed } = fixSwiftSource(source, "test.swift");
    expect(fixed).toContain("import ActivityKit");
  });
});

describe("live activities — AX749 Activity.request needs @MainActor", () => {
  it("flags Activity.request outside @MainActor", () => {
    const source = `
      import ActivityKit
      func start() {
          Activity<DeliveryAttributes>.request(attributes: a, content: c)
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX749");
  });

  it("accepts Activity.request inside a @MainActor function", () => {
    const source = `
      import ActivityKit
      @MainActor
      func start() {
          Activity<DeliveryAttributes>.request(attributes: a, content: c)
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX749")).toHaveLength(
      0
    );
  });
});
