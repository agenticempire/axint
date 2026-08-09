import { createServer, type Server } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Role,
  TaskState,
  type ListTasksRequest,
  type Message,
  type Task,
} from "@a2a-js/sdk";
import {
  DefaultExecutionEventBus,
  RequestContext,
  ServerCallContext,
  type AgentExecutionEvent,
} from "@a2a-js/sdk/server";
import { afterEach, describe, expect, it } from "vitest";
import { createAxintAgentCard } from "../../src/a2a/agent-card.js";
import { AxintA2AUser, parseTokens } from "../../src/a2a/auth.js";
import { AxintA2AExecutor } from "../../src/a2a/executor.js";
import { parseAxintA2ARequest } from "../../src/a2a/request.js";
import { createAxintA2AApp } from "../../src/a2a/server.js";
import { AxintA2ACancelledError } from "../../src/a2a/service.js";
import { AxintA2ATaskStore } from "../../src/a2a/task-store.js";
import { AXINT_A2A_REQUEST_SCHEMA } from "../../src/a2a/types.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Axint A2A", () => {
  it("publishes a v1 Agent Card with bounded skills and bearer security", () => {
    const card = createAxintAgentCard({
      endpointUrl: "https://example.test/a2a",
      authenticationRequired: true,
    });

    expect(card.supportedInterfaces).toEqual([
      expect.objectContaining({
        url: "https://example.test/a2a",
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      }),
    ]);
    expect(card.skills.map((skill) => skill.id)).toEqual([
      "check_apple_code",
      "diagnose_apple_failure",
      "prove_apple_project",
      "plan_apple_repair",
    ]);
    expect(card.capabilities).toMatchObject({
      streaming: true,
      pushNotifications: false,
    });
    expect(card.securitySchemes).toHaveProperty("Bearer");
  });

  it("validates token configuration without retaining plaintext secrets", () => {
    const tokens = parseTokens("team-a=0123456789abcdef,team-b=fedcba9876543210");
    expect(tokens.map((token) => token.id)).toEqual(["team-a", "team-b"]);
    expect(tokens[0].digest).toHaveLength(32);
    expect(String(tokens[0].digest)).not.toContain("0123456789abcdef");
    expect(() => parseTokens("weak=short")).toThrow(/at least 16/);
    expect(() => parseTokens("same=0123456789abcdef,same=fedcba9876543210")).toThrow(
      /Duplicate/
    );
  });

  it("parses structured input and rejects paths outside the project root", () => {
    const projectRoot = temporaryDirectory("axint-a2a-request-");
    writeFileSync(join(projectRoot, "Example.swift"), "import SwiftUI\n", "utf8");
    const parsed = parseAxintA2ARequest(
      userMessage({
        skill: "check_apple_code",
        input: { sourcePath: "Example.swift" },
      }),
      { projectRoot }
    );
    expect(parsed.input.sourcePath).toBe(
      realpathSync(join(projectRoot, "Example.swift"))
    );

    expect(() =>
      parseAxintA2ARequest(
        userMessage({
          skill: "check_apple_code",
          input: { sourcePath: "../outside.swift" },
        }),
        { projectRoot }
      )
    ).toThrow(/inside the project/);
    expect(() =>
      parseAxintA2ARequest(
        userMessage({ skill: "prove_apple_project", input: { timeoutSeconds: 9_999 } }),
        { projectRoot }
      )
    ).toThrow(/1 through 3600/);

    const outside = temporaryDirectory("axint-a2a-outside-");
    writeFileSync(join(outside, "Outside.swift"), "struct Outside {}\n", "utf8");
    symlinkSync(join(outside, "Outside.swift"), join(projectRoot, "Linked.swift"));
    expect(() =>
      parseAxintA2ARequest(
        userMessage({
          skill: "prove_apple_project",
          input: { modifiedFiles: ["Linked.swift"] },
        }),
        { projectRoot }
      )
    ).toThrow(/configured project root/);
  });

  it("persists tasks atomically and isolates them by tenant and authenticated owner", async () => {
    const root = temporaryDirectory("axint-a2a-store-");
    const store = new AxintA2ATaskStore({ stateDirectory: root });
    const ownerA = context("tenant-a", "owner-a");
    const ownerB = context("tenant-a", "owner-b");
    const otherTenant = context("tenant-b", "owner-a");
    const task = sampleTask("task-1", "context-1");
    await store.save(task, ownerA);

    expect(await store.load(task.id, ownerA)).toEqual(task);
    expect(await store.load(task.id, ownerB)).toBeUndefined();
    expect(await store.load(task.id, otherTenant)).toBeUndefined();

    const listed = await store.list(listRequest(), ownerA);
    expect(listed.totalSize).toBe(1);
    expect(listed.tasks[0].artifacts).toEqual([]);
    expect((await store.list(listRequest(), ownerB)).totalSize).toBe(0);
  });

  it("propagates cancellation to a running execution and emits one canceled terminal state", async () => {
    const root = temporaryDirectory("axint-a2a-cancel-");
    let started!: () => void;
    const didStart = new Promise<void>((resolveStart) => {
      started = resolveStart;
    });
    const executor = new AxintA2AExecutor({
      projectRoot: root,
      runner: async ({ signal }) => {
        started();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new AxintA2ACancelledError()), {
            once: true,
          });
        });
        throw new Error("unreachable");
      },
      heartbeatMs: 60_000,
    });
    const eventBus = new DefaultExecutionEventBus();
    const events: AgentExecutionEvent[] = [];
    eventBus.on("event", (event) => events.push(event));
    const request = new RequestContext(
      {
        tenant: "",
        message: userMessage({ skill: "prove_apple_project", input: {} }),
        configuration: undefined,
        metadata: undefined,
      },
      "task-cancel",
      "context-cancel",
      context("", "owner-a")
    );

    const execution = executor.execute(request, eventBus);
    await didStart;
    await executor.cancelTask("task-cancel", eventBus);
    await execution;
    const canceled = events.filter(
      (event) =>
        event.kind === "statusUpdate" &&
        event.data.status?.state === TaskState.TASK_STATE_CANCELED
    );
    expect(canceled).toHaveLength(1);
  });

  it("serves authenticated JSON-RPC and never persists or returns the input source", async () => {
    const root = temporaryDirectory("axint-a2a-http-");
    const stateDirectory = temporaryDirectory("axint-a2a-http-state-");
    const secret = "0123456789abcdef0123456789abcdef";
    const source =
      "struct PrivateSourceMarker: View { var body: some View { EmptyView() } }";
    const created = createAxintA2AApp({
      projectRoot: root,
      stateDirectory,
      tokens: `test=${secret}`,
      publicUrl: "http://127.0.0.1:41242",
    });
    const server = createServer(created.app);
    const url = await listen(server);
    try {
      const cardResponse = await fetch(`${url}/.well-known/agent-card.json`);
      expect(cardResponse.status).toBe(200);
      expect((await cardResponse.json()) as object).toMatchObject({
        name: "Axint Apple Proof and Repair",
      });

      const unauthorized = await fetch(`${url}/a2a`, {
        method: "POST",
        headers: { "content-type": "application/json", "a2a-version": "1.0" },
        body: JSON.stringify(sendMessageBody(source)),
      });
      expect(unauthorized.status).toBe(401);

      const unsupportedVersion = await fetch(`${url}/a2a`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(sendMessageBody(source)),
      });
      expect(unsupportedVersion.status).toBe(400);
      expect(await unsupportedVersion.text()).toMatch(/version.*supported/i);

      const response = await fetch(`${url}/a2a`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
          "a2a-version": "1.0",
        },
        body: JSON.stringify(sendMessageBody(source)),
      });
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("TASK_STATE_COMPLETED");
      expect(text).toContain("input_not_persisted");
      expect(text).not.toContain("PrivateSourceMarker");

      const persisted = persistedTaskContents(stateDirectory);
      expect(persisted).toContain("input_not_persisted");
      expect(persisted).not.toContain("PrivateSourceMarker");
    } finally {
      await close(server);
    }
  });
});

function userMessage(payload: Record<string, unknown>): Message {
  return {
    messageId: "message-1",
    contextId: "",
    taskId: "",
    role: Role.ROLE_USER,
    parts: [
      {
        content: {
          $case: "data",
          value: { schema: AXINT_A2A_REQUEST_SCHEMA, ...payload },
        },
        metadata: undefined,
        filename: "",
        mediaType: "application/vnd.axint.a2a-request+json",
      },
    ],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

function context(tenant: string, owner: string): ServerCallContext {
  return new ServerCallContext({
    tenant,
    requestedVersion: "1.0",
    user: new AxintA2AUser(owner, true),
  });
}

function sampleTask(id: string, contextId: string): Task {
  return {
    id,
    contextId,
    status: {
      state: TaskState.TASK_STATE_COMPLETED,
      message: undefined,
      timestamp: "2026-08-03T00:00:00.000Z",
    },
    artifacts: [
      {
        artifactId: "artifact-1",
        name: "result",
        description: "",
        parts: [],
        metadata: undefined,
        extensions: [],
      },
    ],
    history: [],
    metadata: undefined,
  };
}

function listRequest(): ListTasksRequest {
  return {
    tenant: "tenant-a",
    contextId: "",
    status: TaskState.TASK_STATE_UNSPECIFIED,
    pageToken: "",
    statusTimestampAfter: undefined,
    includeArtifacts: false,
  };
}

function sendMessageBody(source: string): object {
  return {
    jsonrpc: "2.0",
    id: "request-1",
    method: "SendMessage",
    params: {
      message: {
        messageId: "message-http-1",
        contextId: "",
        taskId: "",
        role: "ROLE_USER",
        parts: [
          {
            data: {
              schema: AXINT_A2A_REQUEST_SCHEMA,
              skill: "check_apple_code",
              input: { source, fileName: "Private.swift", platform: "iOS" },
            },
            mediaType: "application/vnd.axint.a2a-request+json",
          },
        ],
        metadata: {},
        extensions: [],
        referenceTaskIds: [],
      },
      configuration: {
        acceptedOutputModes: ["application/json"],
        returnImmediately: false,
      },
      metadata: {},
    },
  };
}

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function persistedTaskContents(stateDirectory: string): string {
  const taskRoot = join(stateDirectory, "tasks");
  const scope = readdirSync(taskRoot)[0];
  const file = readdirSync(join(taskRoot, scope))[0];
  return readFileSync(join(taskRoot, scope, file), "utf8");
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server did not bind TCP.");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}
