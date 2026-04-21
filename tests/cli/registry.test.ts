import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashBundle } from "../../src/core/bundle-hash.js";
import { registerAdd } from "../../src/cli/add.js";
import { registerLogin } from "../../src/cli/login.js";
import { registerPublish } from "../../src/cli/publish.js";
import { registerSearch } from "../../src/cli/search.js";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(() => ({ unref: vi.fn() })),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const VALID_INTENT = `
import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CreateEvent",
  title: "Create Event",
  description: "Creates a calendar event",
  domain: "productivity",
  params: {
    title: param.string("Event title"),
  },
  perform: async ({ title }) => ({ title }),
});
`;

type FetchResponse = {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
};

function jsonResponse(data: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERROR",
    json: async () => data,
  };
}

async function run(program: Command, args: string[]) {
  program.name("axint");
  await program.parseAsync(["node", "axint", ...args], { from: "node" });
}

describe("registry CLI commands", () => {
  const originalHome = process.env.HOME;
  const originalCwd = process.cwd();
  const originalRegistryUrl = process.env.AXINT_REGISTRY_URL;
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetchMock =
    vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<FetchResponse>
    >();

  let tempRoot = "";

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "axint-registry-cli-"));
    process.env.HOME = join(tempRoot, "home");
    process.env.AXINT_REGISTRY_URL = "https://registry.example.test";
    mkdirSync(process.env.HOME, { recursive: true });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    spawnMock.mockClear();
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalRegistryUrl === undefined) delete process.env.AXINT_REGISTRY_URL;
    else process.env.AXINT_REGISTRY_URL = originalRegistryUrl;
    vi.unstubAllGlobals();
  });

  it("covers axint login and stores credentials", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          device_code: "device-123",
          user_code: "ABCD-EFGH",
          verification_uri: "https://registry.example.test/device",
          interval: 0,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-123" }));

    const program = new Command();
    registerLogin(program);
    await run(program, ["login"]);

    const credsPath = join(process.env.HOME!, ".axint", "credentials.json");
    expect(JSON.parse(readFileSync(credsPath, "utf-8"))).toEqual({
      access_token: "token-123",
      registry: "https://registry.example.test",
    });
    expect(spawnMock).toHaveBeenCalled();
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("better repair guidance in terminal");
    expect(output).toContain("saved history");
    expect(output).toContain("shareable links");
  });

  it("covers axint publish and sends the compiled bundle to the registry", async () => {
    const projectDir = join(tempRoot, "publish-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "intent.ts"), VALID_INTENT, "utf-8");
    writeFileSync(join(projectDir, "README.md"), "# Create Event\n", "utf-8");
    writeFileSync(
      join(projectDir, "axint.json"),
      JSON.stringify(
        {
          namespace: "@axint",
          slug: "create-event",
          version: "1.0.0",
          name: "Create Event",
          description: "Creates a calendar event",
          entry: "intent.ts",
          repository: "https://github.com/agenticempire/axint",
          homepage: "https://axint.ai",
          tags: ["calendar"],
        },
        null,
        2
      ),
      "utf-8"
    );
    mkdirSync(join(process.env.HOME!, ".axint"), { recursive: true });
    writeFileSync(
      join(process.env.HOME!, ".axint", "credentials.json"),
      JSON.stringify({
        access_token: "token-123",
        registry: "https://registry.example.test",
      }),
      "utf-8"
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ url: "https://registry.example.test/@axint/create-event/1.0.0" })
    );

    process.chdir(projectDir);
    const program = new Command();
    registerPublish(program, "0.3.9");
    await run(program, ["publish"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(payload.namespace).toBe("@axint");
    expect(payload.slug).toBe("create-event");
    expect(payload.compiler_version).toBe("0.3.9");
    expect(payload.swift_output).toMatch(/struct CreateEventIntent: AppIntent/);
  });

  it("covers axint add and writes registry bundle files locally", async () => {
    const bundleHash = await hashBundle({
      ts_source: VALID_INTENT,
      py_source: null,
      swift_output: "// swift output",
      plist_fragment: null,
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        namespace: "@axint",
        slug: "create-event",
        version: "1.0.0",
        ts_source: VALID_INTENT,
        py_source: null,
        swift_output: "// swift output",
        plist_fragment: null,
        bundle_hash: bundleHash,
      })
    );

    const installDir = join(tempRoot, "installed");
    const program = new Command();
    registerAdd(program, "0.3.9");
    await run(program, ["add", "@axint/create-event", "--to", installDir]);

    expect(
      readFileSync(join(installDir, "create-event", "intent.ts"), "utf-8")
    ).toContain("defineIntent");
    expect(
      readFileSync(join(installDir, "create-event", "intent.swift"), "utf-8")
    ).toContain("swift output");
  });

  it("covers axint search JSON output", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            package_name: "@axint/create-event",
            name: "Create Event",
            description: "Creates a calendar event",
            downloads: 42,
          },
        ],
        total: 1,
      })
    );

    const program = new Command();
    registerSearch(program, "0.3.9");
    await run(program, ["search", "calendar", "--json"]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"package_name": "@axint/create-event"')
    );
  });
});
