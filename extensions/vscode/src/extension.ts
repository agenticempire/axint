import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.lm.registerMcpServerDefinitionProvider(
    "axint.mcpServer",
    {
      provideMcpServerDefinitions: async () => [
        new vscode.McpStdioServerDefinition(
          "Axint",
          "npx",
          ["-y", "@axintai/compiler@0.3.2", "axint-mcp"],
        ),
      ],
    },
  );

  context.subscriptions.push(provider);
}

export function deactivate() {}
