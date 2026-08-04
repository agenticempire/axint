import { randomUUID } from "node:crypto";
import {
  Role,
  TaskState,
  type Artifact,
  type Message,
  type Task,
  type TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import {
  AgentEvent,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from "@a2a-js/sdk/server";
import { TaskNotCancelableError } from "@a2a-js/sdk/errors";
import { parseAxintA2ARequest } from "./request.js";
import { AxintA2ACancelledError } from "./service.js";
import {
  AXINT_A2A_RESULT_MEDIA_TYPE,
  AxintA2AInputError,
  AxintA2APolicyError,
  type AxintA2AResult,
  type AxintA2ARunner,
} from "./types.js";

export interface AxintA2AExecutorOptions {
  projectRoot: string;
  runner: AxintA2ARunner;
  heartbeatMs?: number;
}

interface ActiveExecution {
  controller: AbortController;
  contextId: string;
  canceledPublished: boolean;
}

export class AxintA2AExecutor implements AgentExecutor {
  private readonly active = new Map<string, ActiveExecution>();
  private readonly heartbeatMs: number;

  constructor(private readonly options: AxintA2AExecutorOptions) {
    this.heartbeatMs = Math.max(options.heartbeatMs ?? 15_000, 1_000);
  }

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const task = initialTask(requestContext);
    eventBus.publish(AgentEvent.task(task));

    if (this.active.has(task.id)) {
      publishStatus(
        eventBus,
        task.id,
        task.contextId,
        TaskState.TASK_STATE_REJECTED,
        "This task is already running."
      );
      return;
    }

    let parsed;
    try {
      parsed = parseAxintA2ARequest(requestContext.userMessage, {
        projectRoot: this.options.projectRoot,
      });
    } catch (error) {
      if (error instanceof AxintA2AInputError) {
        publishStatus(
          eventBus,
          task.id,
          task.contextId,
          TaskState.TASK_STATE_INPUT_REQUIRED,
          error.message
        );
        return;
      }
      if (error instanceof AxintA2APolicyError) {
        publishStatus(
          eventBus,
          task.id,
          task.contextId,
          TaskState.TASK_STATE_REJECTED,
          error.message
        );
        return;
      }
      throw error;
    }

    const active: ActiveExecution = {
      controller: new AbortController(),
      contextId: task.contextId,
      canceledPublished: false,
    };
    this.active.set(task.id, active);
    publishStatus(
      eventBus,
      task.id,
      task.contextId,
      TaskState.TASK_STATE_WORKING,
      `Running ${parsed.skill}.`
    );
    const heartbeat = setInterval(() => {
      if (!active.controller.signal.aborted) {
        publishStatus(
          eventBus,
          task.id,
          task.contextId,
          TaskState.TASK_STATE_WORKING,
          `${parsed.skill} is still running.`
        );
      }
    }, this.heartbeatMs);
    heartbeat.unref();

    try {
      const execution = await this.options.runner({
        request: parsed,
        signal: active.controller.signal,
      });
      if (active.controller.signal.aborted) throw new AxintA2ACancelledError();
      const artifact = resultArtifact(execution.result, execution.markdown);
      eventBus.publish(
        AgentEvent.artifactUpdate({
          taskId: task.id,
          contextId: task.contextId,
          artifact,
          append: false,
          lastChunk: true,
          metadata: { skill: parsed.skill },
        })
      );
      publishStatus(
        eventBus,
        task.id,
        task.contextId,
        TaskState.TASK_STATE_COMPLETED,
        execution.result.summary
      );
    } catch (error) {
      if (error instanceof AxintA2ACancelledError || active.controller.signal.aborted) {
        if (!active.canceledPublished) {
          publishStatus(
            eventBus,
            task.id,
            task.contextId,
            TaskState.TASK_STATE_CANCELED,
            "Task canceled."
          );
        }
        return;
      }
      publishStatus(
        eventBus,
        task.id,
        task.contextId,
        TaskState.TASK_STATE_FAILED,
        safeFailureMessage(error, this.options.projectRoot)
      );
    } finally {
      clearInterval(heartbeat);
      if (this.active.get(task.id) === active) this.active.delete(task.id);
    }
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    const active = this.active.get(taskId);
    if (!active) throw new TaskNotCancelableError(`Task not cancelable: ${taskId}`);
    active.controller.abort();
    active.canceledPublished = true;
    publishStatus(
      eventBus,
      taskId,
      active.contextId,
      TaskState.TASK_STATE_CANCELED,
      "Task canceled."
    );
  }
}

function initialTask(context: RequestContext): Task {
  const previous = context.task;
  return {
    id: context.taskId,
    contextId: context.contextId,
    status: {
      state: TaskState.TASK_STATE_SUBMITTED,
      message: agentMessage(context.taskId, context.contextId, "Task accepted."),
      timestamp: new Date().toISOString(),
    },
    artifacts: previous?.artifacts ?? [],
    history: [...(previous?.history ?? []), redactedUserMessage(context.userMessage)],
    metadata: {
      ...(previous?.metadata ?? {}),
      service: "axint-a2a",
    },
  };
}

function redactedUserMessage(message: Message): Message {
  return {
    ...message,
    parts: [
      {
        content: {
          $case: "text",
          value: "Request accepted. Input content is omitted from durable task history.",
        },
        metadata: { redaction: "input_not_persisted" },
        filename: "",
        mediaType: "text/plain",
      },
    ],
    metadata: {
      redaction: "input_not_persisted",
    },
  };
}

function publishStatus(
  eventBus: ExecutionEventBus,
  taskId: string,
  contextId: string,
  state: TaskState,
  text: string
): void {
  const update: TaskStatusUpdateEvent = {
    taskId,
    contextId,
    status: {
      state,
      message: agentMessage(taskId, contextId, text),
      timestamp: new Date().toISOString(),
    },
    metadata: undefined,
  };
  eventBus.publish(AgentEvent.statusUpdate(update));
}

function agentMessage(taskId: string, contextId: string, text: string): Message {
  return {
    messageId: randomUUID(),
    contextId,
    taskId,
    role: Role.ROLE_AGENT,
    parts: [
      {
        content: { $case: "text", value: text },
        metadata: undefined,
        filename: "",
        mediaType: "text/plain",
      },
    ],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  };
}

function resultArtifact(result: AxintA2AResult, markdown: string): Artifact {
  return {
    artifactId: randomUUID(),
    name: "axint-result",
    description: "Source-free Axint result and evidence summary.",
    parts: [
      {
        content: { $case: "data", value: result },
        metadata: undefined,
        filename: "axint-result.json",
        mediaType: AXINT_A2A_RESULT_MEDIA_TYPE,
      },
      {
        content: { $case: "text", value: markdown },
        metadata: undefined,
        filename: "axint-result.md",
        mediaType: "text/markdown",
      },
    ],
    metadata: {
      sourceIncluded: false,
      rawLogsIncluded: false,
      absolutePathsIncluded: false,
    },
    extensions: [],
  };
}

function safeFailureMessage(error: unknown, projectRoot: string): string {
  const message = error instanceof Error ? error.message : "Unknown execution error.";
  const redacted = message
    .split(projectRoot)
    .join("<project>")
    .replace(
      /(^|[\s("'`])\/(?:private|tmp|var|Users|home|Volumes)\/[\w@%+.,:=\-/]+/g,
      (_match, prefix: string) => `${prefix}<local-path>`
    );
  return `Axint could not complete the task: ${redacted.slice(0, 1_000)}`;
}
