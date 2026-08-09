import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TaskState,
  type ListTasksRequest,
  type ListTasksResponse,
  type Task,
} from "@a2a-js/sdk";
import type { ServerCallContext, TaskStore } from "@a2a-js/sdk/server";

export interface AxintA2ATaskStoreOptions {
  stateDirectory: string;
}

export class AxintA2ATaskStore implements TaskStore {
  readonly stateDirectory: string;

  constructor(options: AxintA2ATaskStoreOptions) {
    this.stateDirectory = options.stateDirectory;
  }

  async save(task: Task, context: ServerCallContext): Promise<void> {
    const directory = this.scopeDirectory(context);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const destination = join(directory, taskFileName(task.id));
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(task)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, destination);
  }

  async load(taskId: string, context: ServerCallContext): Promise<Task | undefined> {
    try {
      const contents = await readFile(
        join(this.scopeDirectory(context), taskFileName(taskId)),
        "utf8"
      );
      const task = JSON.parse(contents) as Task;
      return task.id === taskId ? structuredClone(task) : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async list(
    params: ListTasksRequest,
    context: ServerCallContext
  ): Promise<ListTasksResponse> {
    const tasks = await this.readScope(context);
    const filtered = tasks
      .filter((task) => !params.contextId || task.contextId === params.contextId)
      .filter(
        (task) =>
          params.status === TaskState.TASK_STATE_UNSPECIFIED ||
          task.status?.state === params.status
      )
      .filter((task) => {
        if (!params.statusTimestampAfter) return true;
        const timestamp = task.status?.timestamp;
        return Boolean(timestamp && timestamp >= params.statusTimestampAfter);
      })
      .sort((left, right) =>
        (right.status?.timestamp ?? "").localeCompare(left.status?.timestamp ?? "")
      );

    const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 100);
    const offset = decodePageToken(params.pageToken);
    const page = filtered.slice(offset, offset + pageSize).map((task) => {
      const copy = structuredClone(task);
      if (params.historyLength !== undefined) {
        copy.history =
          params.historyLength === 0
            ? []
            : copy.history.slice(-Math.max(0, params.historyLength));
      }
      if (params.includeArtifacts !== true) copy.artifacts = [];
      return copy;
    });
    const nextOffset = offset + page.length;
    return {
      tasks: page,
      nextPageToken: nextOffset < filtered.length ? encodePageToken(nextOffset) : "",
      pageSize,
      totalSize: filtered.length,
    };
  }

  private async readScope(context: ServerCallContext): Promise<Task[]> {
    const directory = this.scopeDirectory(context);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const tasks = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          try {
            return JSON.parse(await readFile(join(directory, name), "utf8")) as Task;
          } catch {
            return undefined;
          }
        })
    );
    return tasks.filter((task): task is Task => Boolean(task?.id));
  }

  private scopeDirectory(context: ServerCallContext): string {
    const tenant = context.tenant || "default";
    const owner = context.user?.userName || "anonymous";
    const scope = createHash("sha256").update(`${tenant}\0${owner}`).digest("hex");
    return join(this.stateDirectory, "tasks", scope);
  }
}

function taskFileName(taskId: string): string {
  return `${createHash("sha256").update(taskId).digest("hex")}.json`;
}

function encodePageToken(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodePageToken(token: string): number {
  if (!token) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      offset?: unknown;
    };
    if (!Number.isInteger(parsed.offset) || Number(parsed.offset) < 0) return 0;
    return Number(parsed.offset);
  } catch {
    return 0;
  }
}
